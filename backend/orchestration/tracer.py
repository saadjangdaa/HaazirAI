"""Antigravity-style tracing for orchestration and agent execution."""

from __future__ import annotations

import logging
import time
from dataclasses import asdict, dataclass
from datetime import datetime
from typing import Any, Dict, List, Optional

logger = logging.getLogger(__name__)


@dataclass
class AgentTrace:
    agent_name: str
    start_time: float
    end_time: float
    duration_ms: float
    input_data: Dict[str, Any]
    output_data: Dict[str, Any]
    steps: List[str]
    errors: List[str]
    api_calls: int
    status: str


@dataclass
class OrchestrationTrace:
    request_id: str
    user_id: str
    user_input: str
    start_time: str
    end_time: str
    total_duration_ms: float
    agents_executed: List[AgentTrace]
    final_output: Dict[str, Any]
    decision_path: List[str]
    errors: List[str]


class Tracer:
    def __init__(self, request_id: str, user_id: str, user_input: str = "") -> None:
        self.request_id = request_id
        self.user_id = user_id
        self.user_input = user_input
        self.agents_traces: List[AgentTrace] = []
        self.decision_log: List[str] = []
        self.errors: List[str] = []
        self.start_time = datetime.now()

    def start_agent(self, agent_name: str) -> "AgentTracer":
        return AgentTracer(agent_name, self)

    def log_decision(self, decision: str) -> None:
        self.decision_log.append(f"[{datetime.now().isoformat()}] {decision}")

    def log_error(self, error: str) -> None:
        self.errors.append(error)
        logger.error("[%s] %s", self.request_id, error)

    def finalize(self, final_output: Optional[Dict[str, Any]] = None) -> OrchestrationTrace:
        end_time = datetime.now()
        duration_ms = (end_time - self.start_time).total_seconds() * 1000
        return OrchestrationTrace(
            request_id=self.request_id,
            user_id=self.user_id,
            user_input=self.user_input,
            start_time=self.start_time.isoformat(),
            end_time=end_time.isoformat(),
            total_duration_ms=duration_ms,
            agents_executed=self.agents_traces,
            final_output=final_output or {},
            decision_path=self.decision_log,
            errors=self.errors,
        )

    def to_dict(self, final_output: Optional[Dict[str, Any]] = None) -> Dict[str, Any]:
        trace = self.finalize(final_output)
        return {
            "request_id": trace.request_id,
            "user_id": trace.user_id,
            "user_input": trace.user_input,
            "start_time": trace.start_time,
            "end_time": trace.end_time,
            "total_duration_ms": trace.total_duration_ms,
            "agents": [asdict(agent) for agent in trace.agents_executed],
            "decisions": trace.decision_path,
            "errors": trace.errors,
            "agent_count": len(trace.agents_executed),
            "error_count": len(trace.errors),
            "final_output": trace.final_output,
        }


class AgentTracer:
    def __init__(self, agent_name: str, parent_tracer: Tracer) -> None:
        self.agent_name = agent_name
        self.parent_tracer = parent_tracer
        self.start_time = time.time()
        self.steps: List[str] = []
        self.api_calls = 0
        self.errors: List[str] = []
        self.input_data: Dict[str, Any] = {}
        self.output_data: Dict[str, Any] = {}
        self._finalized = False

    def __enter__(self) -> "AgentTracer":
        self.log_step("agent_started")
        return self

    def __exit__(self, exc_type, exc_val, exc_tb) -> bool:
        if exc_val is not None:
            self.log_error(str(exc_val))
        if not self._finalized:
            self.finalize(self.input_data, self.output_data)
        return False

    def log_step(self, step: str) -> None:
        timestamp = datetime.now().isoformat()
        full_log = f"[{timestamp}] {self.agent_name}: {step}"
        self.steps.append(full_log)
        logger.info(full_log)

    def log_api_call(self, api: str, params: Optional[Dict[str, Any]] = None) -> None:
        self.api_calls += 1
        if params:
            self.log_step(f"API Call #{self.api_calls}: {api} params={params}")
        else:
            self.log_step(f"API Call #{self.api_calls}: {api}")

    def log_error(self, error: str) -> None:
        self.errors.append(error)
        self.parent_tracer.log_error(f"{self.agent_name}: {error}")

    def finalize(self, input_data: Dict[str, Any], output_data: Dict[str, Any]) -> AgentTrace:
        if self._finalized:
            return self.parent_tracer.agents_traces[-1]
        self.input_data = input_data
        self.output_data = output_data
        end_time = time.time()
        duration_ms = (end_time - self.start_time) * 1000
        status = "error" if self.errors else "success"
        trace = AgentTrace(
            agent_name=self.agent_name,
            start_time=self.start_time,
            end_time=end_time,
            duration_ms=duration_ms,
            input_data=input_data,
            output_data=output_data,
            steps=self.steps,
            errors=self.errors,
            api_calls=self.api_calls,
            status=status,
        )
        self.parent_tracer.agents_traces.append(trace)
        self._finalized = True
        return trace
