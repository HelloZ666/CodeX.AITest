"""Tests for ast_parser helpers."""

from services.ast_parser import (
    extract_changed_methods,
    extract_methods_from_code,
    parse_java_code,
)


class TestParseJavaCode:
    def test_parse_simple_class(self, simple_java_code):
        result = parse_java_code(simple_java_code)
        assert len(result.errors) == 0
        assert len(result.classes) == 1

        cls = result.classes[0]
        assert cls.package_name == "com.example.user"
        assert cls.class_name == "UserService"
        assert len(cls.methods) == 2

    def test_parse_method_names(self, simple_java_code):
        result = parse_java_code(simple_java_code)
        method_names = [method.method_name for method in result.classes[0].methods]
        assert "createUser" in method_names
        assert "updateUser" in method_names

    def test_parse_method_parameters(self, simple_java_code):
        result = parse_java_code(simple_java_code)
        create_method = next(
            method for method in result.classes[0].methods if method.method_name == "createUser"
        )
        assert "String" in create_method.parameters

    def test_parse_full_qualified_name(self, simple_java_code):
        result = parse_java_code(simple_java_code)
        method = result.classes[0].methods[0]
        assert method.full_qualified_name.startswith("com.example.user.UserService.")

    def test_parse_empty_code(self):
        result = parse_java_code("")
        assert len(result.errors) > 0

    def test_parse_invalid_java(self):
        result = parse_java_code("this is not java code at all!!!")
        assert len(result.errors) > 0

    def test_parse_class_with_constructor(self):
        code = """package com.example;
public class MyClass {
    public MyClass(String arg) {}
    public void doSomething() {}
}"""
        result = parse_java_code(code)
        assert len(result.errors) == 0
        method_names = [method.method_name for method in result.classes[0].methods]
        assert "MyClass" in method_names
        assert "doSomething" in method_names

    def test_parse_modified_code(self, modified_java_code):
        result = parse_java_code(modified_java_code)
        assert len(result.errors) == 0
        method_names = [method.method_name for method in result.classes[0].methods]
        assert "deleteUser" in method_names
        assert "createUser" in method_names


class TestExtractMethodsFromCode:
    def test_extract_methods(self, simple_java_code):
        methods = extract_methods_from_code(simple_java_code)
        assert len(methods) == 2

    def test_extract_from_empty(self):
        methods = extract_methods_from_code("")
        assert methods == []


class TestExtractChangedMethods:
    def test_find_new_method(self, simple_java_code, modified_java_code):
        changed = extract_changed_methods(modified_java_code, simple_java_code)
        changed_names = [method.method_name for method in changed]
        assert "deleteUser" in changed_names

    def test_no_changes(self, simple_java_code):
        changed = extract_changed_methods(simple_java_code, simple_java_code)
        assert len(changed) == 0

    def test_all_new(self, simple_java_code):
        changed = extract_changed_methods(simple_java_code, "")
        assert len(changed) == 2
