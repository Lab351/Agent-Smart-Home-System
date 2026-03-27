"""shared 运行时行为测试。"""

import asyncio
import json

import pytest

from shared.a2a.base_agent import BaseA2AAgent
from shared.a2a.room_agent import RoomAgentA2A
from shared.models.mqtt_messages import (
    ArbitrationResponseMessage,
    DescriptionMessage,
    DeviceCapability,
    DeviceState,
    StateMessage,
)
from shared.mqtt.client_manager import MqttClientManager
from shared.mqtt.topic_manager import AgentType


class DummyAgent(BaseA2AAgent):
    def __init__(self):
        super().__init__(
            agent_id="room-agent-bedroom",
            broker_config={"host": "localhost", "port": 1883},
            room_id="bedroom",
        )
        self.handled_messages = []
        self.heartbeat_calls = 0

    def _get_agent_type(self) -> AgentType:
        return AgentType.ROOM

    async def _setup_subscriptions(self):
        return None

    async def _handle_message(self, topic: str, message):
        self.handled_messages.append((topic, message))

    async def _send_heartbeat(self):
        self.heartbeat_calls += 1


class FakePahoClient:
    def __init__(self):
        self.subscribe_calls = []

    def subscribe(self, topic, qos=0):
        self.subscribe_calls.append((topic, qos))


@pytest.mark.asyncio
async def test_mqtt_client_manager_resubscribes_on_connect():
    manager = MqttClientManager(
        agent_id="room-agent-bedroom",
        broker_config={"host": "localhost", "port": 1883},
    )
    manager.subscribe("room/bedroom/agent/+/state", qos=0)
    manager.subscribe("home/policy", qos=1)

    fake_client = FakePahoClient()
    manager.client = fake_client

    manager._on_connect(fake_client, None, None, 0, None)

    assert fake_client.subscribe_calls == [
        ("room/bedroom/agent/+/state", 0),
        ("home/policy", 1),
    ]


@pytest.mark.asyncio
async def test_receive_flow_dispatches_message_and_event():
    agent = DummyAgent()
    agent.mqtt_client.set_message_handler(agent._handle_raw_message)

    events = []

    @agent.on("state")
    async def handle_event(event):
        events.append(event)

    message = StateMessage(
        message_id="state-1",
        timestamp="2024-01-15T10:30:00Z",
        agent_id="room-agent-bedroom",
        devices=[DeviceState(device_id="light_1", state="on")],
    )

    await agent.mqtt_client._dispatch_message(
        "room/bedroom/agent/room-agent-bedroom/state",
        message.model_dump_json(),
    )

    assert len(agent.handled_messages) == 1
    assert agent.handled_messages[0][0] == "room/bedroom/agent/room-agent-bedroom/state"
    assert isinstance(agent.handled_messages[0][1], StateMessage)
    assert len(events) == 1
    assert events[0].event_type == "state"


@pytest.mark.asyncio
async def test_request_describe_waits_for_description_response():
    agent = DummyAgent()
    response_topic = "room/bedroom/agent/room-agent-bedroom/description"

    async def publish(topic: str, payload: str, qos: int):
        sent = json.loads(payload)
        response = DescriptionMessage(
            message_id="desc-1",
            timestamp="2024-01-15T10:30:01Z",
            agent_id="room-agent-bedroom",
            agent_type="room",
            version="1.0.0",
            devices=[
                DeviceCapability(
                    id="light_1",
                    name="Main Light",
                    type="light",
                    actions=["on", "off"],
                )
            ],
            capabilities=["light_control"],
            correlation_id=sent["correlation_id"],
        )
        asyncio.create_task(agent._handle_raw_message(response_topic, response.model_dump_json()))

    agent.mqtt_client.publish = publish

    response = await agent.request_describe("bedroom", "room-agent-bedroom", timeout=0.5)

    assert response.agent_id == "room-agent-bedroom"
    assert response.correlation_id is not None
    assert response.capabilities == ["light_control"]


@pytest.mark.asyncio
async def test_room_agent_arbitration_matches_response_by_request_id():
    agent = RoomAgentA2A(
        agent_id="room-agent-bedroom",
        room_id="bedroom",
        broker_config={"host": "localhost", "port": 1883},
    )

    async def publish(topic: str, payload: str, qos: int):
        sent = json.loads(payload)
        response = ArbitrationResponseMessage(
            message_id="arb-resp-1",
            timestamp="2024-01-15T10:30:01Z",
            request_id=sent["correlation_id"],
            decision="accept",
            reason="approved",
        )
        asyncio.create_task(
            agent._handle_raw_message(
                f"home/arbitration/response/{sent['correlation_id']}",
                response.model_dump_json(),
            )
        )

    agent.mqtt_client.publish = publish

    response = await agent.request_arbitration(
        conflict_type="multi_user_intent",
        intent={"target_device": "light_1", "action": "on"},
        timeout=0.5,
    )

    assert response.request_id is not None
    assert response.decision == "accept"


@pytest.mark.asyncio
async def test_unmatched_arbitration_response_is_ignored():
    agent = DummyAgent()
    agent.mqtt_client.set_message_handler(agent._handle_raw_message)

    events = []

    @agent.on("arbitration_response")
    async def handle_event(event):
        events.append(event)

    message = ArbitrationResponseMessage(
        message_id="arb-resp-2",
        timestamp="2024-01-15T10:30:01Z",
        request_id="unknown-request",
        decision="reject",
        reason="not-found",
    )

    await agent.mqtt_client._dispatch_message(
        "home/arbitration/response/unknown-request",
        message.model_dump_json(),
    )

    assert agent.handled_messages == []
    assert events == []


@pytest.mark.asyncio
async def test_agent_start_triggers_heartbeat_after_running_flag():
    agent = DummyAgent()
    agent.heartbeat_interval = 0.01

    async def connect():
        agent.mqtt_client._connected = True
        return True

    async def disconnect():
        agent.mqtt_client._connected = False

    agent.mqtt_client.connect = connect
    agent.mqtt_client.disconnect = disconnect

    await agent.start()
    await asyncio.sleep(0.03)
    await agent.stop()

    assert agent.heartbeat_calls >= 1
