"""Java AST parsing helpers."""

from dataclasses import dataclass, field
from typing import Optional

try:
    import javalang
except ImportError:
    javalang = None


@dataclass
class MethodInfo:
    package_name: str
    class_name: str
    method_name: str
    modifiers: list[str] = field(default_factory=list)
    return_type: Optional[str] = None
    parameters: list[str] = field(default_factory=list)

    @property
    def full_qualified_name(self) -> str:
        parts = [self.package_name, self.class_name, self.method_name]
        return ".".join(part for part in parts if part)


@dataclass
class ClassInfo:
    package_name: str
    class_name: str
    methods: list[MethodInfo] = field(default_factory=list)

    @property
    def full_qualified_name(self) -> str:
        parts = [self.package_name, self.class_name]
        return ".".join(part for part in parts if part)


@dataclass
class ParseResult:
    classes: list[ClassInfo] = field(default_factory=list)
    errors: list[str] = field(default_factory=list)


def _type_to_name(type_node: object) -> Optional[str]:
    if type_node is None:
        return None

    type_name = getattr(type_node, "name", None) or str(type_node)
    dimensions = getattr(type_node, "dimensions", None) or []
    if dimensions:
        type_name = f"{type_name}{'[]' * len(dimensions)}"
    return type_name


def _build_method_info(
    package_name: str,
    class_name: str,
    member: object,
    *,
    is_constructor: bool = False,
) -> MethodInfo:
    parameters: list[str] = []
    for param in getattr(member, "parameters", None) or []:
        parameters.append(_type_to_name(getattr(param, "type", None)) or "Object")

    return MethodInfo(
        package_name=package_name,
        class_name=class_name,
        method_name=member.name,
        modifiers=list(getattr(member, "modifiers", None) or []),
        return_type=None if is_constructor else _type_to_name(getattr(member, "return_type", None)),
        parameters=parameters,
    )


def parse_java_code(source_code: str) -> ParseResult:
    if javalang is None:
        return ParseResult(errors=["javalang not installed"])

    if not source_code or not source_code.strip():
        return ParseResult(errors=["source code is empty"])

    try:
        tree = javalang.parse.parse(source_code)
    except javalang.parser.JavaSyntaxError as exc:
        return ParseResult(errors=[f"Java syntax error: {exc}"])
    except Exception as exc:
        return ParseResult(errors=[f"parse error: {exc}"])

    package_name = ""
    if getattr(tree, "package", None):
        package_name = tree.package.name

    classes: list[ClassInfo] = []
    for type_decl in getattr(tree, "types", []) or []:
        if not hasattr(type_decl, "name"):
            continue

        methods: list[MethodInfo] = []
        for member in getattr(type_decl, "body", None) or []:
            if isinstance(member, javalang.tree.MethodDeclaration):
                methods.append(_build_method_info(package_name, type_decl.name, member))
            elif isinstance(member, javalang.tree.ConstructorDeclaration):
                methods.append(
                    _build_method_info(
                        package_name,
                        type_decl.name,
                        member,
                        is_constructor=True,
                    )
                )

        classes.append(
            ClassInfo(
                package_name=package_name,
                class_name=type_decl.name,
                methods=methods,
            )
        )

    return ParseResult(classes=classes)


def extract_methods_from_code(source_code: str) -> list[MethodInfo]:
    result = parse_java_code(source_code)
    methods: list[MethodInfo] = []
    for class_info in result.classes:
        methods.extend(class_info.methods)
    return methods


def _method_signature(method: MethodInfo) -> str:
    return (
        f"{method.package_name}."
        f"{method.class_name}."
        f"{method.method_name}({','.join(method.parameters)})"
    )


def extract_changed_methods(current_code: str, history_code: str) -> list[MethodInfo]:
    current_methods = extract_methods_from_code(current_code)
    history_methods = extract_methods_from_code(history_code)
    history_signatures = {_method_signature(method) for method in history_methods}

    changed: list[MethodInfo] = []
    for method in current_methods:
        if _method_signature(method) not in history_signatures:
            changed.append(method)

    return changed
