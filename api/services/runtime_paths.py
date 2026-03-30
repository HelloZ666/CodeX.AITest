import os
from functools import lru_cache
from pathlib import Path


RUNTIME_DIR_ENV = "APP_RUNTIME_DIR"
LOG_DIR_ENV = "APP_LOG_DIR"
DB_PATH_ENV = "DB_PATH"


def get_project_root() -> Path:
    return Path(__file__).resolve().parents[2]


def get_project_env_path() -> Path:
    return get_project_root() / ".env"


def _strip_env_value(value: str) -> str:
    normalized = value.strip()
    if len(normalized) >= 2 and normalized[0] == normalized[-1] and normalized[0] in {'"', "'"}:
        return normalized[1:-1].strip()
    return normalized


def _read_env_file(path: Path) -> dict[str, str]:
    if not path.exists() or not path.is_file():
        return {}

    values: dict[str, str] = {}
    for raw_line in path.read_text(encoding="utf-8").splitlines():
        line = raw_line.strip()
        if not line or line.startswith("#") or "=" not in line:
            continue
        key, value = line.split("=", 1)
        key = key.strip()
        if not key:
            continue
        values[key] = _strip_env_value(value)
    return values


def _get_process_environment_value(name: str) -> str | None:
    configured = os.environ.get(name, "").strip()
    return configured or None


def _get_runtime_root_from_bootstrap_sources(project_root: Path, project_env: dict[str, str]) -> Path:
    configured = _get_process_environment_value(RUNTIME_DIR_ENV) or project_env.get(RUNTIME_DIR_ENV, "").strip()
    if configured:
        return Path(configured).expanduser()
    return project_root.parent / f"{project_root.name}.runtime"


@lru_cache(maxsize=1)
def _load_env_files() -> tuple[dict[str, str], dict[str, str]]:
    project_root = get_project_root()
    project_env = _read_env_file(project_root / ".env")
    runtime_root = _get_runtime_root_from_bootstrap_sources(project_root, project_env)
    runtime_env = _read_env_file(runtime_root / ".env")
    return project_env, runtime_env


def reset_loaded_env_cache() -> None:
    _load_env_files.cache_clear()


def get_runtime_env_path() -> Path:
    return get_runtime_root() / ".env"


def get_environment_variable(name: str) -> str | None:
    process_value = _get_process_environment_value(name)
    if process_value:
        return process_value

    project_env, runtime_env = _load_env_files()
    file_value = runtime_env.get(name, "").strip() or project_env.get(name, "").strip()
    return file_value or None


def get_default_runtime_root() -> Path:
    project_root = get_project_root()
    return project_root.parent / f"{project_root.name}.runtime"


def get_runtime_root() -> Path:
    configured = get_environment_variable(RUNTIME_DIR_ENV)
    if configured:
        return Path(configured).expanduser()
    return get_default_runtime_root()


def get_default_log_dir() -> Path:
    return get_runtime_root() / "logs"


def get_log_dir() -> Path:
    configured = get_environment_variable(LOG_DIR_ENV)
    if configured:
        return Path(configured).expanduser()
    return get_default_log_dir()


def get_default_db_path() -> Path:
    return get_runtime_root() / "data" / "codetestguard.db"


def get_db_path() -> Path:
    configured = get_environment_variable(DB_PATH_ENV)
    if configured:
        return Path(configured).expanduser()
    return get_default_db_path()


def ensure_directory(path: Path) -> Path:
    path.mkdir(parents=True, exist_ok=True)
    return path
