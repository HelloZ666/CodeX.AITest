import os
from pathlib import Path


RUNTIME_DIR_ENV = "APP_RUNTIME_DIR"
LOG_DIR_ENV = "APP_LOG_DIR"
DB_PATH_ENV = "DB_PATH"


def get_project_root() -> Path:
    return Path(__file__).resolve().parents[2]


def get_default_runtime_root() -> Path:
    project_root = get_project_root()
    return project_root.parent / f"{project_root.name}.runtime"


def get_runtime_root() -> Path:
    configured = os.environ.get(RUNTIME_DIR_ENV, "").strip()
    if configured:
        return Path(configured).expanduser()
    return get_default_runtime_root()


def get_default_log_dir() -> Path:
    return get_runtime_root() / "logs"


def get_log_dir() -> Path:
    configured = os.environ.get(LOG_DIR_ENV, "").strip()
    if configured:
        return Path(configured).expanduser()
    return get_default_log_dir()


def get_default_db_path() -> Path:
    return get_runtime_root() / "data" / "codetestguard.db"


def get_db_path() -> Path:
    configured = os.environ.get(DB_PATH_ENV, "").strip()
    if configured:
        return Path(configured).expanduser()
    return get_default_db_path()


def ensure_directory(path: Path) -> Path:
    path.mkdir(parents=True, exist_ok=True)
    return path
