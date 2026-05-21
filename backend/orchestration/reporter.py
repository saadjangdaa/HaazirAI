"""Generate trace reports and compressed ZIP bundles."""

from __future__ import annotations

import base64
import io
import json
import zipfile
from datetime import datetime
from typing import Any, Dict


class ReportGenerator:
    @staticmethod
    def generate_trace_report(trace_dict: Dict[str, Any]) -> str:
        lines = [
            "# Haazir Dost - Orchestration Trace Report",
            "",
            f"**Request ID:** {trace_dict.get('request_id', 'unknown')}",
            f"**User ID:** {trace_dict.get('user_id', 'unknown')}",
            f"**Timestamp:** {datetime.now().isoformat()}",
            "",
            "---",
            "",
            "## Execution Summary",
            "",
            "| Agent | Duration | Status | API Calls |",
            "|-------|----------|--------|-----------|",
        ]
        for agent in trace_dict.get("agents", []):
            lines.append(
                f"| {agent.get('agent_name', '-')}"
                f" | {float(agent.get('duration_ms', 0)):.1f}ms"
                f" | {agent.get('status', '-')}"
                f" | {int(agent.get('api_calls', 0))} |"
            )

        lines.extend(
            [
                "",
                f"**Total Agents:** {trace_dict.get('agent_count', 0)}",
                f"**Total Errors:** {trace_dict.get('error_count', 0)}",
                "",
                "---",
                "",
                "## Detailed Logs",
                "",
            ]
        )

        for agent in trace_dict.get("agents", []):
            lines.extend(
                [
                    f"### {agent.get('agent_name', 'UNKNOWN')} Agent",
                    "",
                    f"**Status:** {agent.get('status', '-')}",
                    f"**Duration:** {float(agent.get('duration_ms', 0)):.1f}ms",
                    f"**API Calls:** {int(agent.get('api_calls', 0))}",
                    "",
                    "**Steps:**",
                ]
            )
            for step in agent.get("steps", []):
                lines.append(f"- {step}")
            if agent.get("errors"):
                lines.append("")
                lines.append("**Errors:**")
                for error in agent["errors"]:
                    lines.append(f"- {error}")
            lines.extend(["", "---", ""])
        return "\n".join(lines)

    @staticmethod
    def generate_zip_report(request_id: str, trace_dict: Dict[str, Any]) -> bytes:
        zip_buffer = io.BytesIO()
        with zipfile.ZipFile(zip_buffer, "w", zipfile.ZIP_DEFLATED) as zf:
            zf.writestr(
                f"{request_id}_trace.json",
                json.dumps(trace_dict, indent=2, default=str),
            )
            zf.writestr(
                f"{request_id}_report.md",
                ReportGenerator.generate_trace_report(trace_dict),
            )
            for agent in trace_dict.get("agents", []):
                name = str(agent.get("agent_name", "agent")).lower()
                steps = "\n".join(agent.get("steps", []))
                content = (
                    f"# {agent.get('agent_name', 'Agent')} Agent Log\n\n"
                    f"Execution Time: {float(agent.get('duration_ms', 0)):.1f}ms\n"
                    f"API Calls: {int(agent.get('api_calls', 0))}\n"
                    f"Status: {agent.get('status', '-')}\n\n"
                    f"## Steps Executed\n\n{steps}\n"
                )
                zf.writestr(f"agents/{name}_log.txt", content)
        zip_buffer.seek(0)
        return zip_buffer.getvalue()


def zip_bytes_to_api_payload(zip_data: bytes) -> Dict[str, object]:
    """Encode ZIP bytes for JSON API responses."""
    return {
        "format": "zip",
        "size": len(zip_data),
        "file_base64": base64.b64encode(zip_data).decode("ascii"),
    }
