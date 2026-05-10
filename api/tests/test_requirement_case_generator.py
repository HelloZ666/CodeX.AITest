from services.requirement_case_generator import build_requirement_case_generation_messages


def test_requirement_case_generation_prompt_maps_cases_to_leaf_outline_nodes():
    messages = build_requirement_case_generation_messages(
        {
            "selected_mode": "all",
            "selected_sections": [],
            "points": [
                {
                    "point_id": "P1",
                    "section_title": "下单流程",
                    "text": "订单支持支付、申请退款和取消订单。",
                }
            ],
        }
    )

    system_content = messages[0]["content"]
    user_content = messages[1]["content"]

    assert "每条用例都能映射为思维导图中的一条路径，expected_result 会作为末尾子节点" in system_content
    assert "最后一步必须是预期结果节点的前一个业务动作或场景节点" in system_content
    assert "共同前置步骤应保持相同命名" in user_content
    assert "X 取 expected_result 节点的前一个业务动作" in user_content
    assert "expected_result 写成该动作的成功、失败拦截或展示结果，并且只作为末尾子节点" in user_content
