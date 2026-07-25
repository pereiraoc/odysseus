# routes/vaultfs_routes.py
"""Vault filesystem + git API (fork-local; ver LOCAL_CHANGES.md).

Serve as vaults (Obsidian) de tool_path_extra_roots pro painel de Vaults:
browse/CRUD de arquivos markdown e operações git estilo VS Code.
"""
import logging
import os
import re
import shutil
import subprocess
from typing import Optional

from fastapi import APIRouter, Depends, HTTPException, Query, Request
from fastapi.responses import FileResponse, PlainTextResponse
from pydantic import BaseModel

from src.auth_helpers import require_user
from src.settings import get_setting

logger = logging.getLogger(__name__)

TEXT_MAX_BYTES = 5 * 1024 * 1024  # leitura de texto: 5MB


def _slug(name: str) -> str:
    return re.sub(r"[^a-z0-9]+", "-", name.lower()).strip("-") or "vault"


def _list_vaults() -> list[dict]:
    roots = get_setting("tool_path_extra_roots") or []
    out, seen = [], {}
    for raw in roots:
        if not raw:
            continue
        path = os.path.realpath(str(raw))
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


def setup_vaultfs_routes() -> APIRouter:
    router = APIRouter(prefix="/api/vaultfs", tags=["vaultfs"])

    @router.get("/vaults")
    def list_vaults(request: Request, user: str = Depends(require_user)):
        return {"vaults": _list_vaults()}

    def _build_tree(abs_dir: str, rel_prefix: str) -> list[dict]:
        entries = []
        try:
            with os.scandir(abs_dir) as it:
                for e in it:
                    if e.name.startswith("."):
                        continue
                    rel = f"{rel_prefix}/{e.name}" if rel_prefix else e.name
                    if e.is_dir(follow_symlinks=False):
                        entries.append({
                            "name": e.name, "path": rel, "type": "dir",
                            "children": _build_tree(e.path, rel),
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
    def get_tree(request: Request, vault: str = Query(...), user: str = Depends(require_user)):
        root = _vault_root(vault)
        return {"tree": _build_tree(root, "")}

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

    return router
