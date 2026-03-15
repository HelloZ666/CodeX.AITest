from __future__ import annotations

import io
from typing import Iterable


TEMPLATE_HEADERS = ("包名", "类名", "方法名", "功能描述")


def _normalize_text(value: object) -> str:
    if value is None:
        return ""
    return str(value).replace("\xa0", " ").strip()


def normalize_project_mapping_entries(
    entries: Iterable[dict],
    require_description: bool = True,
) -> list[dict]:
    if not isinstance(entries, list):
        raise ValueError("代码映射数据格式无效")

    normalized_entries: list[dict] = []
    seen_keys: set[tuple[str, str, str]] = set()

    for index, item in enumerate(entries, start=1):
        if not isinstance(item, dict):
            raise ValueError("代码映射条目格式无效")

        package_name = _normalize_text(item.get("package_name") or item.get("包名"))
        class_name = _normalize_text(item.get("class_name") or item.get("类名"))
        method_name = _normalize_text(item.get("method_name") or item.get("方法名"))
        description = _normalize_text(item.get("description") or item.get("功能描述"))

        if not package_name:
            raise ValueError(f"第 {index} 条代码映射缺少包名")
        if not class_name:
            raise ValueError(f"第 {index} 条代码映射缺少类名")
        if not method_name:
            raise ValueError(f"第 {index} 条代码映射缺少方法名")
        if require_description and not description:
            raise ValueError(f"第 {index} 条代码映射缺少功能描述")

        entry_key = (package_name, class_name, method_name)
        if entry_key in seen_keys:
            raise ValueError(
                f"代码映射已存在重复方法：{package_name}.{class_name}.{method_name}"
            )

        seen_keys.add(entry_key)
        normalized_entries.append(
            {
                "package_name": package_name,
                "class_name": class_name,
                "method_name": method_name,
                "description": description,
            }
        )

    return normalized_entries


def build_project_mapping_template() -> bytes:
    try:
        from openpyxl import Workbook
        from openpyxl.styles import Alignment, Font
    except ImportError as exc:
        raise ImportError("openpyxl 库未安装，无法生成代码映射模板") from exc

    workbook = Workbook()
    sheet = workbook.active
    sheet.title = "代码映射"
    sheet.append(list(TEMPLATE_HEADERS))

    for column_index, header in enumerate(TEMPLATE_HEADERS, start=1):
        cell = sheet.cell(row=1, column=column_index, value=header)
        cell.font = Font(bold=True)
        cell.alignment = Alignment(horizontal="center", vertical="center")

    sheet.freeze_panes = "A2"
    sheet.column_dimensions["A"].width = 36
    sheet.column_dimensions["B"].width = 24
    sheet.column_dimensions["C"].width = 24
    sheet.column_dimensions["D"].width = 36

    buffer = io.BytesIO()
    workbook.save(buffer)
    workbook.close()
    return buffer.getvalue()
