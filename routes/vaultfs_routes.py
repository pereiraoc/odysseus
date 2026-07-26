# routes/vaultfs_routes.py
"""Vault filesystem + git API (fork-local; ver LOCAL_CHANGES.md).

Serve as vaults (Obsidian) de tool_path_extra_roots pro painel de Vaults:
browse/CRUD de arquivos markdown e operações git estilo VS Code.
"""
import http.client
import logging
import os
import re
import shutil
import socket as _socket
import subprocess
from datetime import date
from typing import Optional

from fastapi import APIRouter, Depends, HTTPException, Query, Request
from fastapi.responses import FileResponse, PlainTextResponse
from pydantic import BaseModel

from src.auth_helpers import require_user
from src.settings import get_setting, load_settings, save_settings

try:
    import yaml as _yaml
except ImportError:  # pragma: no cover - imagem sempre tem pyyaml
    _yaml = None

logger = logging.getLogger(__name__)

TEXT_MAX_BYTES = 5 * 1024 * 1024  # leitura de texto: 5MB


def _slug(name: str) -> str:
    return re.sub(r"[^a-z0-9]+", "-", name.lower()).strip("-") or "vault"


def _list_vaults() -> list[dict]:
    """Raízes do painel: vaults (tool_path_extra_roots) ∪ raízes do File
    Browser (file_browser_roots), dedup por realpath — vault vence."""
    vault_roots = get_setting("tool_path_extra_roots") or []
    extra_roots = get_setting("file_browser_roots") or []
    out, seen, seen_paths = [], {}, set()
    for raw, is_vault in ([(r, True) for r in vault_roots]
                          + [(r, False) for r in extra_roots]):
        if not raw:
            continue
        path = os.path.realpath(str(raw))
        if path in seen_paths:
            continue
        seen_paths.add(path)
        name = os.path.basename(path.rstrip(os.sep)) or path
        vid = _slug(name)
        if vid in seen:
            seen[vid] += 1
            vid = f"{vid}-{seen[vid]}"
        else:
            seen[vid] = 1
        out.append({
            "id": vid,
            "name": name,
            "path": path,
            "exists": os.path.isdir(path),
            "has_git": os.path.isdir(os.path.join(path, ".git")),
            "is_vault": is_vault,
        })
    return out


def _vault_root(vault_id: str) -> str:
    for v in _list_vaults():
        if v["id"] == vault_id:
            if not v["exists"]:
                raise HTTPException(404, f"Vault path not found on disk: {v['path']}")
            return v["path"]
    raise HTTPException(404, f"Unknown vault: {vault_id}")


def _resolve(root: str, rel: str, *, allow_root: bool = False) -> str:
    """Confina `rel` dentro de `root` (realpath + commonpath). 400 se escapar."""
    rel = (rel or "").strip()
    if not rel or rel in (".", "/"):
        if allow_root:
            return root
        raise HTTPException(400, "path is required")
    if os.path.isabs(rel):
        raise HTTPException(400, "absolute paths not allowed")
    target = os.path.realpath(os.path.join(root, rel))
    try:
        if os.path.commonpath([target, root]) != root:
            raise HTTPException(400, "path escapes vault root")
    except ValueError:
        raise HTTPException(400, "path escapes vault root")
    return target


def _reject_git(rel: str):
    parts = [p for p in (rel or "").replace("\\", "/").split("/") if p]
    if ".git" in parts:
        raise HTTPException(403, "paths inside .git are not accessible")


def _parse_frontmatter(text: str) -> dict:
    """Frontmatter YAML do topo da nota → dict (pyyaml, com fallback raso)."""
    m = re.match(r"^---\r?\n(.*?)\r?\n---\r?\n?", text, re.S)
    if not m:
        return {}
    if _yaml is not None:
        try:
            data = _yaml.safe_load(m.group(1))
            return data if isinstance(data, dict) else {}
        except Exception:
            return {}
    out: dict = {}
    cur = None
    for line in m.group(1).splitlines():
        kv = re.match(r"^([^\s:][^:]*):\s*(.*)$", line)
        li = re.match(r"^\s*-\s*(.*)$", line)
        if kv:
            cur = kv.group(1).strip()
            out[cur] = kv.group(2).strip()
        elif li and cur is not None:
            if not isinstance(out.get(cur), list):
                out[cur] = [out[cur]] if out.get(cur) else []
            out[cur].append(li.group(1).strip())
    return out


# ── Git (subprocess confinado à raiz da vault) ──

def _git(root: str, *args: str, timeout: int = 30, env_extra: Optional[dict] = None):
    """Roda `git <args>` na raiz da vault. Retorna (code, stdout, stderr)."""
    env = os.environ.copy()
    env["GIT_TERMINAL_PROMPT"] = "0"
    env.update(env_extra or {})
    cmd = ["git"]
    if not env.get("GIT_AUTHOR_NAME"):
        # Container sem gitconfig/envs: fallback pra identidade não bloquear commit.
        cmd += ["-c", "user.name=Odysseus", "-c", "user.email=odysseus@local"]
    cmd += list(args)
    try:
        p = subprocess.run(cmd, cwd=root, capture_output=True, text=True,
                           timeout=timeout, env=env)
    except subprocess.TimeoutExpired:
        raise HTTPException(504, f"git {args[0]} timed out")
    except FileNotFoundError:
        raise HTTPException(500, "git binary not available")
    return p.returncode, p.stdout, p.stderr


def _git_ok(root: str, *args: str, timeout: int = 30, env_extra: Optional[dict] = None) -> str:
    code, out, err = _git(root, *args, timeout=timeout, env_extra=env_extra)
    if code != 0:
        raise HTTPException(500, (err or out or f"git {args[0]} failed").strip())
    return out


def _require_repo(root: str):
    if not os.path.isdir(os.path.join(root, ".git")):
        raise HTTPException(400, {"code": "no_git", "message": "vault is not a git repository"})


def _parse_status_v2(out: str) -> dict:
    st = {"branch": None, "upstream": None, "ahead": 0, "behind": 0,
          "staged": [], "unstaged": [], "untracked": []}
    for line in out.splitlines():
        if line.startswith("# branch.head "):
            st["branch"] = line.split(" ", 2)[2]
        elif line.startswith("# branch.upstream "):
            st["upstream"] = line.split(" ", 2)[2]
        elif line.startswith("# branch.ab "):
            m = re.match(r"# branch\.ab \+(\d+) -(\d+)", line)
            if m:
                st["ahead"], st["behind"] = int(m.group(1)), int(m.group(2))
        elif line.startswith("? "):
            st["untracked"].append(line[2:])
        elif line.startswith(("1 ", "2 ")):
            parts = line.split(" ")
            xy = parts[1]
            if line.startswith("2 "):
                # rename: "2 XY sub mH mI mW hH hI Xscore path\torigPath"
                path = " ".join(parts[9:]).split("\t")[0]
            else:
                path = " ".join(parts[8:])
            if xy[0] != ".":
                st["staged"].append({"path": path, "code": xy[0]})
            if xy[1] != ".":
                st["unstaged"].append({"path": path, "code": xy[1]})
        elif line.startswith("u "):
            parts = line.split(" ")
            st["unstaged"].append({"path": " ".join(parts[10:]), "code": "U"})
    return st


# Credencial https só via env (VAULTFS_GIT_TOKEN/VAULTFS_GIT_USER): o helper
# inline referencia as envs — o token nunca aparece em argv nem em disco.
_CRED_HELPER = (
    "!f() { echo \"username=${VAULTFS_GIT_USER:-git}\"; "
    "echo \"password=$VAULTFS_GIT_TOKEN\"; }; f"
)



# ── Obsidian: uma sessão (container oficial) por vault ──
# Containers `odysseus-obsidian-<vault-id>` criados dinamicamente via docker
# API (socket montado pelo overlay). Binds usam caminhos do HOST traduzidos
# de caminhos do container pela env VAULTFS_HOST_MAP (longest-prefix).

DOCKER_SOCK = "/var/run/docker.sock"
SESSION_PREFIX = "odysseus-obsidian-"
SESSION_BASE_PORT = 3010
SESSION_MAX_PORT = 3019


class _UnixHTTP(http.client.HTTPConnection):
    def __init__(self, sock_path):
        super().__init__("localhost")
        self._sock_path = sock_path

    def connect(self):
        s = _socket.socket(_socket.AF_UNIX, _socket.SOCK_STREAM)
        s.settimeout(15)
        s.connect(self._sock_path)
        self.sock = s


def _docker_api(method: str, endpoint: str, body: Optional[dict] = None):
    if not os.path.exists(DOCKER_SOCK):
        raise HTTPException(501, {"code": "no_docker_socket",
                                  "message": "socket do docker não montado no container "
                                             "(ver LOCAL_CHANGES.md, Obsidian por sessão)"})
    try:
        import json as _json
        conn = _UnixHTTP(DOCKER_SOCK)
        payload = _json.dumps(body) if body is not None else None
        headers = {"Content-Type": "application/json"} if payload else {}
        conn.request(method, endpoint, body=payload, headers=headers)
        resp = conn.getresponse()
        return resp.status, resp.read().decode("utf-8", errors="replace")
    except OSError as e:
        raise HTTPException(502, f"docker socket: {e}")


def _host_map() -> list:
    pairs = []
    for part in os.getenv("VAULTFS_HOST_MAP", "").split(","):
        if "=" in part:
            c, h = part.split("=", 1)
            if c.strip() and h.strip():
                pairs.append((c.strip().rstrip("/"), h.strip().rstrip("/")))
    pairs.sort(key=lambda pr: -len(pr[0]))
    return pairs


def _host_path(container_path: str) -> str:
    cp = str(container_path).rstrip("/")
    for c, h in _host_map():
        if cp == c or cp.startswith(c + "/"):
            return h + cp[len(c):]
    raise HTTPException(501, {"code": "no_host_map",
                              "message": f"sem tradução host p/ {container_path} — "
                                         "configure VAULTFS_HOST_MAP no overlay"})


def _session_name(vault_id: str) -> str:
    return f"{SESSION_PREFIX}{vault_id}"


def _session_spec(name: str, vault_name: str, host_vault_dir: str,
                  host_config_dir: str, port: int) -> dict:
    return {
        "Image": os.getenv("OBSIDIAN_IMAGE", "lscr.io/linuxserver/obsidian:latest"),
        "Env": ["PUID=1000", "PGID=1000", "TZ=America/Sao_Paulo"],
        "ExposedPorts": {"3000/tcp": {}},
        "Labels": {"odysseus.vault-session": "1"},
        "HostConfig": {
            "Binds": [f"{host_config_dir}:/config",
                      f"{host_vault_dir}:/vaults/{vault_name}"],
            "PortBindings": {"3000/tcp": [{"HostIp": "127.0.0.1", "HostPort": str(port)}]},
            "SecurityOpt": ["seccomp:unconfined"],
            "ShmSize": 1 << 30,
            "RestartPolicy": {"Name": "unless-stopped"},
        },
    }


def _session_inspect(vault_id: str):
    import json as _json
    st, body = _docker_api("GET", f"/containers/{_session_name(vault_id)}/json")
    if st != 200:
        return st, None
    try:
        return st, _json.loads(body)
    except ValueError:
        return 500, None


def _port_from_inspect(info: dict):
    try:
        return int(info["HostConfig"]["PortBindings"]["3000/tcp"][0]["HostPort"])
    except (KeyError, IndexError, TypeError, ValueError):
        return None


def _used_session_ports() -> set:
    import json as _json
    st, body = _docker_api("GET", "/containers/json?all=1")
    used = set()
    if st != 200:
        return used
    try:
        for c in _json.loads(body):
            names = c.get("Names") or []
            if not any(n.lstrip("/").startswith(SESSION_PREFIX) for n in names):
                continue
            vid = names[0].lstrip("/")[len(SESSION_PREFIX):]
            st2, info = _session_inspect(vid)
            port = _port_from_inspect(info) if info else None
            if port:
                used.add(port)
    except ValueError:
        pass
    return used


def _next_free_port() -> int:
    used = _used_session_ports()
    port = SESSION_BASE_PORT
    while port in used:
        port += 1
    if port > SESSION_MAX_PORT:
        raise HTTPException(507, f"sem porta livre na faixa {SESSION_BASE_PORT}-{SESSION_MAX_PORT} "
                                 "(pare alguma sessão ou amplie CSP_EXTRA_FRAME_SRC)")
    return port


def _sessions_dir() -> str:
    return os.getenv("OBSIDIAN_SESSIONS_DIR", "/app/data/obsidian-sessions")


def _seed_session_config(vault_id: str, vault_name: str):
    """Garante o obsidian.json da sessão apontando pra vault (open:true)."""
    import json as _json
    import secrets as _secrets
    import time as _time
    cfg = os.path.join(_sessions_dir(), vault_id, ".config", "obsidian", "obsidian.json")
    data = {}
    try:
        with open(cfg, encoding="utf-8") as f:
            data = _json.load(f)
    except (OSError, ValueError):
        pass
    vaults = data.setdefault("vaults", {})
    opath = f"/vaults/{vault_name}"
    entry = next((v for v in vaults.values() if v.get("path") == opath), None)
    if entry is None:
        vaults[_secrets.token_hex(8)] = {"path": opath, "ts": int(_time.time() * 1000), "open": True}
    elif not entry.get("open"):
        entry["open"] = True
    else:
        return
    os.makedirs(os.path.dirname(cfg), exist_ok=True)
    with open(cfg, "w", encoding="utf-8") as f:
        _json.dump(data, f, indent=1)


def _vault_entry(vault_id: str) -> dict:
    v = next((x for x in _list_vaults() if x["id"] == vault_id), None)
    if not v:
        raise HTTPException(404, f"Unknown vault: {vault_id}")
    return v


def _session_state(v: dict) -> dict:
    try:
        _host_path(v["path"])
        mounted = v["exists"]
    except HTTPException:
        mounted = False
    exists = running = False
    port = None
    if os.path.exists(DOCKER_SOCK):
        st, info = _session_inspect(v["id"])
        if st == 200 and info:
            exists = True
            running = bool(info.get("State", {}).get("Running"))
            port = _port_from_inspect(info)
    return {"id": v["id"], "name": v["name"], "mounted": mounted,
            "exists": exists, "running": running, "port": port,
            "ui_url": f"http://localhost:{port}" if port else None}


def _ensure_session(vault_id: str) -> dict:
    v = _vault_entry(vault_id)
    if not v["exists"]:
        raise HTTPException(404, f"Vault path not found on disk: {v['path']}")
    host_vault = _host_path(v["path"])
    name = _session_name(vault_id)
    st, info = _session_inspect(vault_id)
    started = False
    if st == 404:
        port = _next_free_port()
        _seed_session_config(vault_id, v["name"])
        host_cfg = _host_path(os.path.join(_sessions_dir(), vault_id))
        spec = _session_spec(name, v["name"], host_vault, host_cfg, port)
        s2, out = _docker_api("POST", f"/containers/create?name={name}", spec)
        if s2 != 201:
            raise HTTPException(502, f"docker create: HTTP {s2} {out[:300]}")
        st, info = _session_inspect(vault_id)
    if not info:
        raise HTTPException(502, "sessão não inspecionável após criação")
    port = _port_from_inspect(info)
    if not info.get("State", {}).get("Running"):
        s3, out = _docker_api("POST", f"/containers/{name}/start")
        if s3 not in (204, 304):
            raise HTTPException(502, f"docker start: HTTP {s3} {out[:200]}")
        started = True
    return {"ok": True, "ui_url": f"http://localhost:{port}", "port": port, "started": started}


class WriteBody(BaseModel):
    vault: str
    path: str
    content: str
    base_mtime: Optional[float] = None
    force: bool = False


class CreateBody(BaseModel):
    vault: str
    path: str
    kind: str = "file"  # "file" | "dir"
    content: str = ""


class RenameBody(BaseModel):
    vault: str
    path: str
    new_path: str


class GitVaultBody(BaseModel):
    vault: str


class GitPathsBody(BaseModel):
    vault: str
    paths: list[str]


class GitCommitBody(BaseModel):
    vault: str
    message: str = ""
    amend: bool = False


class GitCheckoutBody(BaseModel):
    vault: str
    branch: str
    create: bool = False


class TaskToggleBody(BaseModel):
    vault: str
    path: str
    line: int
    done: bool


class SyncToggleBody(BaseModel):
    vault: str
    enable: bool


class ObsidianOpenBody(BaseModel):
    vault: str


class RootsBody(BaseModel):
    roots: list[str]


# ── Obsidian Tasks (formato do plugin: emojis de data/prioridade) ──
TASK_RE = re.compile(r"^(\s*)[-*] \[(.)\] (.*)$")
TASK_DATE_MARKS = {
    "due": "📅", "scheduled": "⏳", "start": "🛫",
    "created": "➕", "done_at": "✅", "cancelled_at": "❌",
}
TASK_PRIORITY = {"🔺": "highest", "⏫": "high", "🔼": "medium", "🔽": "low", "⏬": "lowest"}
_ALL_MARKS = "📅⏳🛫➕✅❌🔁🔺⏫🔼🔽⏬🆔⛔"


def _parse_task_line(line: str):
    m = TASK_RE.match(line)
    if not m:
        return None
    body = m.group(3)
    task = {"status": m.group(2)}
    for key, mark in TASK_DATE_MARKS.items():
        dm = re.search(re.escape(mark) + r"\s*(\d{4}-\d{2}-\d{2})", body)
        task[key] = dm.group(1) if dm else None
    task["priority"] = next((v for e, v in TASK_PRIORITY.items() if e in body), None)
    rm = re.search(r"🔁\s*([^" + _ALL_MARKS + r"]+)", body)
    task["recurrence"] = rm.group(1).strip() if rm else None
    clean = body
    for mark in TASK_DATE_MARKS.values():
        clean = re.sub(re.escape(mark) + r"\s*\d{4}-\d{2}-\d{2}", "", clean)
    clean = re.sub(r"🔁\s*[^" + _ALL_MARKS + r"]+", "", clean)
    for e in TASK_PRIORITY:
        clean = clean.replace(e, "")
    clean = re.sub(r"🆔\s*\S+|⛔\s*\S+", "", clean)
    task["text"] = clean.strip()
    return task


def setup_vaultfs_routes() -> APIRouter:
    router = APIRouter(prefix="/api/vaultfs", tags=["vaultfs"])

    @router.get("/vaults")
    def list_vaults(request: Request, user: str = Depends(require_user)):
        return {"vaults": _list_vaults()}

    @router.put("/roots")
    def set_roots(body: RootsBody, request: Request, user: str = Depends(require_user)):
        cleaned = []
        for r in body.roots:
            r = str(r).strip()
            if not r:
                continue
            if not os.path.isabs(r):
                raise HTTPException(400, f"caminho não absoluto: {r}")
            cleaned.append(r)
        s = load_settings()
        s["file_browser_roots"] = cleaned
        save_settings(s)
        return {"ok": True, "vaults": _list_vaults()}

    def _dir_has_visible_children(abs_dir: str) -> bool:
        try:
            with os.scandir(abs_dir) as it:
                return any(not e.name.startswith(".") for e in it)
        except OSError:
            return False

    def _build_tree(abs_dir: str, rel_prefix: str, depth: int = 0, level: int = 1) -> list[dict]:
        entries = []
        try:
            with os.scandir(abs_dir) as it:
                for e in it:
                    if e.name.startswith("."):
                        continue
                    rel = f"{rel_prefix}/{e.name}" if rel_prefix else e.name
                    if e.is_dir(follow_symlinks=False):
                        if depth and level >= depth:
                            # lazy: filhos carregados sob demanda (?path=)
                            entries.append({
                                "name": e.name, "path": rel, "type": "dir",
                                "children": None,
                                "has_children": _dir_has_visible_children(e.path),
                            })
                        else:
                            entries.append({
                                "name": e.name, "path": rel, "type": "dir",
                                "children": _build_tree(e.path, rel, depth, level + 1),
                            })
                    elif e.is_file(follow_symlinks=False):
                        st = e.stat()
                        entries.append({
                            "name": e.name, "path": rel, "type": "file",
                            "size": st.st_size, "mtime": st.st_mtime,
                        })
        except PermissionError:
            pass
        entries.sort(key=lambda n: (n["type"] != "dir", n["name"].casefold()))
        return entries

    @router.get("/tree")
    def get_tree(request: Request, vault: str = Query(...),
                 path: str = Query(""), depth: int = Query(0, ge=0, le=10),
                 user: str = Depends(require_user)):
        root = _vault_root(vault)
        if path:
            _reject_git(path)
        start = _resolve(root, path, allow_root=True)
        if not os.path.isdir(start):
            raise HTTPException(404, "directory not found")
        rel_prefix = path.strip().strip("/") if path else ""
        return {"tree": _build_tree(start, rel_prefix, depth)}

    @router.get("/file")
    def read_file(request: Request, vault: str = Query(...), path: str = Query(...),
                  user: str = Depends(require_user)):
        root = _vault_root(vault)
        _reject_git(path)
        target = _resolve(root, path)
        if not os.path.isfile(target):
            raise HTTPException(404, "file not found")
        st = os.stat(target)
        if st.st_size > TEXT_MAX_BYTES:
            raise HTTPException(413, "file too large for text view")
        with open(target, "rb") as f:
            data = f.read()
        if b"\x00" in data[:8192]:
            raise HTTPException(400, "binary file")
        return {"content": data.decode("utf-8", errors="replace"),
                "mtime": st.st_mtime, "size": st.st_size, "path": path}

    @router.get("/raw")
    def read_raw(request: Request, vault: str = Query(...), path: str = Query(...),
                 user: str = Depends(require_user)):
        root = _vault_root(vault)
        _reject_git(path)
        target = _resolve(root, path)
        if not os.path.isfile(target):
            raise HTTPException(404, "file not found")
        return FileResponse(target)

    @router.put("/file")
    def write_file(body: WriteBody, request: Request, user: str = Depends(require_user)):
        root = _vault_root(body.vault)
        _reject_git(body.path)
        target = _resolve(root, body.path)
        if os.path.isdir(target):
            raise HTTPException(400, "target is a directory")
        if os.path.exists(target) and body.base_mtime is not None and not body.force:
            disk = os.stat(target).st_mtime
            if abs(disk - body.base_mtime) > 1e-4:
                raise HTTPException(409, {"code": "mtime_conflict", "disk_mtime": disk})
        os.makedirs(os.path.dirname(target) or root, exist_ok=True)
        tmp = target + ".vaultfs-tmp"
        with open(tmp, "w", encoding="utf-8") as f:
            f.write(body.content)
        os.replace(tmp, target)
        return {"ok": True, "mtime": os.stat(target).st_mtime}

    @router.post("/file")
    def create_entry(body: CreateBody, request: Request, user: str = Depends(require_user)):
        root = _vault_root(body.vault)
        _reject_git(body.path)
        target = _resolve(root, body.path)
        if os.path.exists(target):
            raise HTTPException(409, "already exists")
        if body.kind == "dir":
            os.makedirs(target)
        else:
            os.makedirs(os.path.dirname(target) or root, exist_ok=True)
            with open(target, "w", encoding="utf-8") as f:
                f.write(body.content)
        return {"ok": True, "path": body.path}

    @router.post("/rename")
    def rename_entry(body: RenameBody, request: Request, user: str = Depends(require_user)):
        root = _vault_root(body.vault)
        _reject_git(body.path)
        _reject_git(body.new_path)
        src = _resolve(root, body.path)
        dst = _resolve(root, body.new_path)
        if not os.path.exists(src):
            raise HTTPException(404, "source not found")
        if os.path.exists(dst):
            raise HTTPException(409, "destination already exists")
        os.makedirs(os.path.dirname(dst) or root, exist_ok=True)
        os.rename(src, dst)
        return {"ok": True}

    @router.delete("/file")
    def delete_entry(request: Request, vault: str = Query(...), path: str = Query(...),
                     recursive: bool = Query(False), user: str = Depends(require_user)):
        root = _vault_root(vault)
        _reject_git(path)
        target = _resolve(root, path)
        if target == root:
            raise HTTPException(400, "cannot delete vault root")
        if os.path.isdir(target):
            if not recursive:
                raise HTTPException(400, "directory delete requires recursive=true")
            shutil.rmtree(target)
        elif os.path.isfile(target):
            os.remove(target)
        else:
            raise HTTPException(404, "not found")
        return {"ok": True}

    # dirs pesados fora do índice do Dataview/assets (raízes de código no Files)
    META_IGNORE_DIRS = {"node_modules", "__pycache__", "venv", ".venv",
                        "dist", "build", "target"}

    @router.get("/meta")
    def vault_meta(request: Request, vault: str = Query(...), user: str = Depends(require_user)):
        """Metadados das notas .md (frontmatter + tags) + lista de assets —
        base do Dataview/bases e da resolução de embeds no frontend."""
        root = _vault_root(vault)
        notes = []
        assets = []
        for dirpath, dirnames, filenames in os.walk(root):
            dirnames[:] = [d for d in dirnames
                           if not d.startswith(".") and d not in META_IGNORE_DIRS]
            for fn in filenames:
                if fn.startswith("."):
                    continue
                if not fn.lower().endswith(".md"):
                    rel_a = os.path.relpath(os.path.join(dirpath, fn), root).replace(os.sep, "/")
                    assets.append({"name": fn, "path": rel_a})
                    continue
                full = os.path.join(dirpath, fn)
                rel = os.path.relpath(full, root).replace(os.sep, "/")
                try:
                    st = os.stat(full)
                    with open(full, "r", encoding="utf-8", errors="replace") as f:
                        head = f.read(65536)
                except OSError:
                    continue
                props = _parse_frontmatter(head)
                tags: set = set()
                fm_tags = props.get("tags") or props.get("tag")
                if isinstance(fm_tags, str):
                    tags.update(t.strip().lstrip("#") for t in re.split(r"[,\s]+", fm_tags) if t.strip())
                elif isinstance(fm_tags, list):
                    tags.update(str(t).strip().lstrip("#") for t in fm_tags if str(t).strip())
                # corpo sem code blocks (``` e `inline`) — tags/links/fields como no Obsidian
                no_code = re.sub(r"```.*?(```|\Z)", "", head, flags=re.S)
                no_code = re.sub(r"`[^`\n]*`", "", no_code)
                tags.update(mt.group(1) for mt in re.finditer(r"(?<![\w#])#([\w\-/]+)", no_code))
                # wikilinks de saída (grafo pro dataview: FROM [[]], outgoing())
                outlinks = []
                for lm in re.finditer(r"\[\[([^\]|#]+)(?:#[^\]|]*)?(?:\|[^\]]*)?\]\]", no_code):
                    t = lm.group(1).strip()
                    if t and t not in outlinks:
                        outlinks.append(t)
                # campos inline do Dataview: `Chave:: valor` (linha ou item de
                # lista). O valor NÃO cruza linha ([ \t], não \s — senão um
                # campo vazio `chave::` engole a linha seguinte) e campo vazio
                # vira null, como no Dataview.
                for im in re.finditer(
                        r"^[ \t]*(?:[-*][ \t]+)?([A-Za-zÀ-ÿ][\w À-ÿ.-]*?)::[ \t]*(.*)$",
                        no_code, re.M):
                    key = im.group(1).strip()
                    if key and key not in props:
                        props[key] = im.group(2).strip() or None
                aliases = props.get("aliases") or props.get("alias") or []
                if isinstance(aliases, str):
                    aliases = [a.strip() for a in aliases.split(",") if a.strip()]
                notes.append({
                    "path": rel, "name": fn[:-3], "folder": os.path.dirname(rel),
                    "mtime": st.st_mtime, "ctime": st.st_ctime, "size": st.st_size,
                    "tags": sorted(tags), "aliases": aliases,
                    "outlinks": outlinks, "props": props,
                })
        return {"notes": notes, "assets": assets}

    @router.get("/base")
    def read_base(request: Request, vault: str = Query(...), path: str = Query(...),
                  user: str = Depends(require_user)):
        """Arquivo .base (databases do Obsidian) parseado como YAML → JSON."""
        root = _vault_root(vault)
        _reject_git(path)
        target = _resolve(root, path)
        if not os.path.isfile(target):
            raise HTTPException(404, "file not found")
        if _yaml is None:
            raise HTTPException(501, "pyyaml not available for .base parsing")
        try:
            with open(target, "r", encoding="utf-8", errors="replace") as f:
                data = _yaml.safe_load(f.read())
        except Exception as e:
            raise HTTPException(400, f"invalid base yaml: {e}")
        return {"base": data if isinstance(data, dict) else {}}

    @router.get("/tasks")
    def vault_tasks(request: Request, vault: str = Query(...), user: str = Depends(require_user)):
        """Tarefas estilo Obsidian Tasks de todas as notas .md da vault."""
        root = _vault_root(vault)
        tasks = []
        for dirpath, dirnames, filenames in os.walk(root):
            dirnames[:] = [d for d in dirnames if not d.startswith(".")]
            for fn in filenames:
                if fn.startswith(".") or not fn.lower().endswith(".md"):
                    continue
                full = os.path.join(dirpath, fn)
                rel = os.path.relpath(full, root).replace(os.sep, "/")
                try:
                    with open(full, "r", encoding="utf-8", errors="replace") as f:
                        lines = f.read().splitlines()
                except OSError:
                    continue
                in_fence = False
                for i, line in enumerate(lines):
                    if line.lstrip().startswith("```"):
                        in_fence = not in_fence
                        continue
                    if in_fence:
                        continue
                    t = _parse_task_line(line)
                    if t:
                        t.update({"path": rel, "line": i})
                        tasks.append(t)
        return {"tasks": tasks}

    @router.post("/tasks/toggle")
    def task_toggle(body: TaskToggleBody, request: Request, user: str = Depends(require_user)):
        """Marca/desmarca uma tarefa reescrevendo a linha (com ✅ data, como o plugin)."""
        root = _vault_root(body.vault)
        _reject_git(body.path)
        target = _resolve(root, body.path)
        if not os.path.isfile(target):
            raise HTTPException(404, "file not found")
        with open(target, "r", encoding="utf-8", errors="replace") as f:
            lines = f.read().splitlines(keepends=False)
        if not (0 <= body.line < len(lines)) or not TASK_RE.match(lines[body.line]):
            raise HTTPException(409, {"code": "task_moved",
                                      "message": "a linha mudou no disco — recarregue as tarefas"})
        line = lines[body.line]
        if body.done:
            line = re.sub(r"\[.\]", "[x]", line, count=1)
            line = re.sub(r"\s*✅\s*\d{4}-\d{2}-\d{2}", "", line)
            line += f" ✅ {date.today().isoformat()}"
        else:
            line = re.sub(r"\[.\]", "[ ]", line, count=1)
            line = re.sub(r"\s*✅\s*\d{4}-\d{2}-\d{2}", "", line)
        lines[body.line] = line
        tmp = target + ".vaultfs-tmp"
        with open(tmp, "w", encoding="utf-8") as f:
            f.write("\n".join(lines) + "\n")
        os.replace(tmp, target)
        return {"ok": True, "task": {**_parse_task_line(line), "path": body.path, "line": body.line}}

    # ── Obsidian: sessões por vault (helpers no nível do módulo) ──

    @router.get("/obsidian-sync")
    def sync_status(request: Request, user: str = Depends(require_user)):
        sessions = [_session_state(v) for v in _list_vaults() if v.get("is_vault")]
        return {"available": os.path.exists(DOCKER_SOCK), "sessions": sessions}

    @router.post("/obsidian-open")
    def obsidian_open(body: ObsidianOpenBody, request: Request, user: str = Depends(require_user)):
        return _ensure_session(body.vault)

    @router.post("/obsidian-sync")
    def sync_toggle(body: SyncToggleBody, request: Request, user: str = Depends(require_user)):
        if body.enable:
            r = _ensure_session(body.vault)
            return {"ok": True, "running": True, "port": r["port"]}
        name = _session_name(_vault_entry(body.vault)["id"])
        st, out = _docker_api("POST", f"/containers/{name}/stop")
        if st not in (204, 304, 404):
            raise HTTPException(502, f"docker stop: HTTP {st} {out[:200]}")
        return {"ok": True, "running": False}

    # ── Git ──

    def _validated_rel_paths(root: str, paths: list) -> list:
        out = []
        for p in paths or []:
            _reject_git(p)
            _resolve(root, p)  # 400 se escapar
            out.append(p)
        if not out:
            raise HTTPException(400, "paths is required")
        return out

    @router.get("/git/status")
    def git_status(request: Request, vault: str = Query(...), user: str = Depends(require_user)):
        root = _vault_root(vault)
        if not os.path.isdir(os.path.join(root, ".git")):
            return {"has_git": False, "branch": None, "upstream": None, "ahead": 0,
                    "behind": 0, "staged": [], "unstaged": [], "untracked": []}
        out = _git_ok(root, "status", "--porcelain=v2", "--branch")
        return {"has_git": True, **_parse_status_v2(out)}

    @router.post("/git/stage")
    def git_stage(body: GitPathsBody, request: Request, user: str = Depends(require_user)):
        root = _vault_root(body.vault)
        _require_repo(root)
        _git_ok(root, "add", "--", *_validated_rel_paths(root, body.paths))
        return {"ok": True}

    @router.post("/git/unstage")
    def git_unstage(body: GitPathsBody, request: Request, user: str = Depends(require_user)):
        root = _vault_root(body.vault)
        _require_repo(root)
        _git_ok(root, "restore", "--staged", "--", *_validated_rel_paths(root, body.paths))
        return {"ok": True}

    @router.post("/git/discard")
    def git_discard(body: GitPathsBody, request: Request, user: str = Depends(require_user)):
        root = _vault_root(body.vault)
        _require_repo(root)
        rels = _validated_rel_paths(root, body.paths)
        tracked, untracked = [], []
        for p in rels:
            c, _o, _e = _git(root, "ls-files", "--error-unmatch", "--", p)
            (tracked if c == 0 else untracked).append(p)
        if tracked:
            _git_ok(root, "restore", "--", *tracked)
        for p in untracked:
            t = _resolve(root, p)
            if os.path.isfile(t):
                os.remove(t)
        return {"ok": True}

    @router.post("/git/commit")
    def git_commit(body: GitCommitBody, request: Request, user: str = Depends(require_user)):
        root = _vault_root(body.vault)
        _require_repo(root)
        msg = (body.message or "").strip()
        if not msg and not body.amend:
            raise HTTPException(400, "commit message is required")
        args = ["commit"]
        if body.amend:
            args += ["--amend"]
            args += ["-m", msg] if msg else ["--no-edit"]
        else:
            args += ["-m", msg]
        _git_ok(root, *args)
        return {"ok": True, "hash": _git_ok(root, "rev-parse", "HEAD").strip()}

    @router.post("/git/undo_commit")
    def git_undo(body: GitVaultBody, request: Request, user: str = Depends(require_user)):
        root = _vault_root(body.vault)
        _require_repo(root)
        code, _o, _e = _git(root, "rev-parse", "--verify", "--quiet", "HEAD~1")
        if code != 0:
            raise HTTPException(400, "nothing to undo (first commit)")
        _git_ok(root, "reset", "--soft", "HEAD~1")
        return {"ok": True}

    SEP, EOR = "\x1f", "\x1e"

    @router.get("/git/log")
    def git_log(request: Request, vault: str = Query(...), limit: int = Query(50, le=500),
                skip: int = Query(0, ge=0), user: str = Depends(require_user)):
        root = _vault_root(vault)
        _require_repo(root)
        code, out, err = _git(root, "log", f"--pretty=format:%H{SEP}%h{SEP}%an{SEP}%aI{SEP}%s{EOR}",
                              "-n", str(limit), f"--skip={skip}")
        if code != 0:
            return {"commits": []}  # repo sem commits ainda
        commits = []
        for rec in out.split(EOR):
            rec = rec.strip("\n")
            if not rec:
                continue
            h, short, an, date, subj = rec.split(SEP, 4)
            commits.append({"hash": h, "short": short, "author": an, "date": date, "subject": subj})
        return {"commits": commits}

    @router.get("/git/diff")
    def git_diff(request: Request, vault: str = Query(...), path: Optional[str] = Query(None),
                 staged: bool = Query(False), commit: Optional[str] = Query(None),
                 user: str = Depends(require_user)):
        root = _vault_root(vault)
        _require_repo(root)
        if commit:
            if not re.fullmatch(r"[0-9a-fA-F]{4,40}", commit):
                raise HTTPException(400, "invalid commit hash")
            args = ["show", "--format=commit %H%nAuthor: %an%nDate: %aI%n%n    %s%n", commit]
        else:
            args = ["diff", "--staged"] if staged else ["diff"]
        if path:
            _reject_git(path)
            _resolve(root, path)
            args += ["--", path]
        out = _git_ok(root, *args, timeout=60)
        return PlainTextResponse(out)

    @router.get("/git/branches")
    def git_branches(request: Request, vault: str = Query(...), user: str = Depends(require_user)):
        root = _vault_root(vault)
        _require_repo(root)
        out = _git_ok(root, "for-each-ref", "refs/heads",
                      "--format=%(HEAD)%(refname:short)")
        branches = []
        for line in out.splitlines():
            if not line:
                continue
            cur = line.startswith("*")
            branches.append({"name": line.lstrip("* ").strip(), "current": cur})
        return {"branches": branches}

    @router.post("/git/checkout")
    def git_checkout(body: GitCheckoutBody, request: Request, user: str = Depends(require_user)):
        root = _vault_root(body.vault)
        _require_repo(root)
        b = (body.branch or "").strip()
        if not re.fullmatch(r"[\w\-./]{1,120}", b) or b.startswith("-"):
            raise HTTPException(400, "invalid branch name")
        args = ["checkout", "-b", b] if body.create else ["checkout", b]
        _git_ok(root, *args)
        return {"ok": True}

    @router.post("/git/init")
    def git_init(body: GitVaultBody, request: Request, user: str = Depends(require_user)):
        root = _vault_root(body.vault)
        if os.path.isdir(os.path.join(root, ".git")):
            raise HTTPException(400, "already a git repository")
        _git_ok(root, "init", "-b", "main")
        return {"ok": True}

    def _git_net(root: str, *args: str) -> str:
        return _git_ok(root, "-c", f"credential.helper={_CRED_HELPER}", *args, timeout=120)

    @router.post("/git/push")
    def git_push(body: GitVaultBody, request: Request, user: str = Depends(require_user)):
        root = _vault_root(body.vault)
        _require_repo(root)
        code, _o, _e = _git(root, "rev-parse", "--abbrev-ref", "--symbolic-full-name", "@{u}")
        if code != 0:
            branch = _git_ok(root, "rev-parse", "--abbrev-ref", "HEAD").strip()
            output = _git_net(root, "push", "-u", "origin", branch)
        else:
            output = _git_net(root, "push")
        return {"ok": True, "output": output}

    @router.post("/git/pull")
    def git_pull(body: GitVaultBody, request: Request, user: str = Depends(require_user)):
        root = _vault_root(body.vault)
        _require_repo(root)
        return {"ok": True, "output": _git_net(root, "pull", "--ff-only")}

    @router.post("/git/fetch")
    def git_fetch(body: GitVaultBody, request: Request, user: str = Depends(require_user)):
        root = _vault_root(body.vault)
        _require_repo(root)
        return {"ok": True, "output": _git_net(root, "fetch", "--all", "--prune")}

    @router.get("/git/graph")
    def git_graph(request: Request, vault: str = Query(...), limit: int = Query(200, le=1000),
                  skip: int = Query(0, ge=0), user: str = Depends(require_user)):
        root = _vault_root(vault)
        _require_repo(root)
        code, out, err = _git(
            root, "log", "--all", "--topo-order",
            f"--pretty=format:%H{SEP}%h{SEP}%P{SEP}%an{SEP}%aI{SEP}%D{SEP}%s{EOR}",
            "-n", str(limit), f"--skip={skip}")
        if code != 0:
            return {"commits": []}
        commits = []
        for rec in out.split(EOR):
            rec = rec.strip("\n")
            if not rec:
                continue
            h, short, parents, an, date, refs, subj = rec.split(SEP, 6)
            commits.append({
                "hash": h, "short": short,
                "parents": parents.split() if parents else [],
                "author": an, "date": date,
                "refs": [r.strip() for r in refs.split(",") if r.strip()],
                "subject": subj,
            })
        return {"commits": commits}

    return router
