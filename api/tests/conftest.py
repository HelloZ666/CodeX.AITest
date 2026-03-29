"""
conftest.py - 共享 fixtures
"""

import json
import os
import sys
from pathlib import Path

import pytest

# 将 api 目录加入 Python 路径
API_DIR = Path(__file__).resolve().parent.parent
sys.path.insert(0, str(API_DIR))

FIXTURES_DIR = Path(__file__).resolve().parent / "fixtures"


@pytest.fixture(autouse=True)
def auth_env(monkeypatch):
    """为认证相关测试提供默认环境变量"""
    monkeypatch.setenv("SESSION_SECRET", "test-session-secret")
    monkeypatch.setenv("INITIAL_ADMIN_USERNAME", "admin")
    monkeypatch.setenv("INITIAL_ADMIN_PASSWORD", "Admin123!")
    monkeypatch.setenv("INITIAL_ADMIN_DISPLAY_NAME", "测试管理员")


@pytest.fixture
def sample_code_changes_json() -> str:
    """加载示例代码改动JSON"""
    path = FIXTURES_DIR / "sample_code_changes.json"
    return path.read_text(encoding="utf-8")


@pytest.fixture
def sample_code_changes_dict() -> dict:
    """加载示例代码改动字典"""
    path = FIXTURES_DIR / "sample_code_changes.json"
    return json.loads(path.read_text(encoding="utf-8"))


@pytest.fixture
def sample_mapping_csv() -> str:
    """加载示例映射关系CSV"""
    path = FIXTURES_DIR / "sample_mapping.csv"
    return path.read_text(encoding="utf-8")


@pytest.fixture
def sample_test_cases_csv() -> str:
    """加载示例测试用例CSV"""
    path = FIXTURES_DIR / "sample_test_cases.csv"
    return path.read_text(encoding="utf-8")


@pytest.fixture
def sample_deepseek_response() -> dict:
    """加载示例DeepSeek返回"""
    path = FIXTURES_DIR / "sample_deepseek_response.json"
    return json.loads(path.read_text(encoding="utf-8"))


@pytest.fixture
def simple_java_code() -> str:
    """简单的Java代码片段"""
    return """package com.example.user;

public class UserService {

    public User createUser(String name, String email) {
        User user = new User(name, email);
        return userRepository.save(user);
    }

    public User updateUser(Long id, String name) {
        User user = userRepository.findById(id);
        user.setName(name);
        return userRepository.save(user);
    }
}
"""


@pytest.fixture
def modified_java_code() -> str:
    """修改后的Java代码片段"""
    return """package com.example.user;

import java.util.Date;

public class UserService {

    public User createUser(String name, String email) {
        if (name == null || name.isEmpty()) {
            throw new IllegalArgumentException("Name cannot be empty");
        }
        User user = new User(name, email);
        user.setStatus("active");
        return userRepository.save(user);
    }

    public User updateUser(Long id, String name) {
        User user = userRepository.findById(id);
        user.setName(name);
        return userRepository.save(user);
    }

    public void deleteUser(Long id) {
        User user = userRepository.findById(id);
        user.setStatus("deleted");
        userRepository.save(user);
    }
}
"""


@pytest.fixture
def sample_mapping_rows() -> list[dict]:
    """映射关系字典列表"""
    return [
        {"包名": "com.example.user", "类名": "UserService", "方法名": "createUser", "功能描述": "创建用户", "测试点": "用户创建主流程"},
        {"包名": "com.example.user", "类名": "UserService", "方法名": "updateUser", "功能描述": "更新用户信息", "测试点": "信息修改与保存"},
        {"包名": "com.example.user", "类名": "UserService", "方法名": "deleteUser", "功能描述": "删除用户", "测试点": "删除确认与状态变更"},
        {"包名": "com.example.order", "类名": "OrderService", "方法名": "createOrder", "功能描述": "创建订单", "测试点": "下单成功与库存校验"},
    ]


@pytest.fixture
def sample_test_case_rows() -> list[dict]:
    """测试用例字典列表"""
    return [
        {
            "测试用例ID": "TC001",
            "测试功能": "创建用户",
            "测试步骤": "1. 输入用户名和邮箱 2. 点击创建按钮 3. 检查返回结果",
            "预期结果": "用户创建成功，返回用户ID",
        },
        {
            "测试用例ID": "TC002",
            "测试功能": "更新用户信息",
            "测试步骤": "1. 输入用户ID 2. 修改用户名 3. 点击更新按钮",
            "预期结果": "用户信息更新成功",
        },
        {
            "测试用例ID": "TC003",
            "测试功能": "创建订单",
            "测试步骤": "1. 选择用户 2. 添加商品 3. 提交订单",
            "预期结果": "订单创建成功，状态为pending",
        },
    ]
