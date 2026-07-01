"""
Agent Metrics - Performance tracking and monitoring.
"""

import logging
from typing import Dict, List, Any
from dataclasses import dataclass, field
from datetime import datetime
from collections import deque


@dataclass
class MetricRecord:
    """A single metric record."""
    timestamp: str
    metric_type: str
    value: float
    metadata: Dict[str, Any] = field(default_factory=dict)


class AgentMetrics:
    """
    Collects and tracks agent performance metrics.

    Metrics tracked:
    - Message processing time
    - Tool execution counts and times
    - Error rates
    - Session counts
    """

    def __init__(self, agent_id: str):
        self.agent_id = agent_id
        self.logger = logging.getLogger(f"metrics.{agent_id}")

        # Time series data (last 1000 records)
        self._message_times: deque = deque(maxlen=1000)
        self._tool_executions: deque = deque(maxlen=1000)
        self._errors: deque = deque(maxlen=100)
        self._session_counts: Dict[str, int] = {}

        # Cumulative counters
        self._total_messages = 0
        self._total_tools_executed = 0
        self._total_errors = 0
        self._start_time = datetime.now()

    def record_message_processing(
        self,
        processing_time_seconds: float,
        tool_calls_count: int
    ):
        """Record a message processing event."""
        record = MetricRecord(
            timestamp=datetime.now().isoformat(),
            metric_type="message_processing",
            value=processing_time_seconds,
            metadata={'tool_calls': tool_calls_count}
        )

        self._message_times.append(record)
        self._total_messages += 1
        self._total_tools_executed += tool_calls_count

    def record_tool_execution(
        self,
        tool_name: str,
        execution_time_ms: float,
        success: bool
    ):
        """Record a tool execution event."""
        record = MetricRecord(
            timestamp=datetime.now().isoformat(),
            metric_type="tool_execution",
            value=execution_time_ms,
            metadata={
                'tool_name': tool_name,
                'success': success
            }
        )

        self._tool_executions.append(record)

    def record_error(self, error: Exception):
        """Record an error event."""
        record = MetricRecord(
            timestamp=datetime.now().isoformat(),
            metric_type="error",
            value=0,
            metadata={
                'error_type': type(error).__name__,
                'error_message': str(error)
            }
        )

        self._errors.append(record)
        self._total_errors += 1

    def record_session_created(self, session_id: str):
        """Record a session creation."""
        self._session_counts[session_id] = 1

    def record_session_ended(self, session_id: str):
        """Record a session end."""
        if session_id in self._session_counts:
            del self._session_counts[session_id]

    def get_average_message_time(self) -> float:
        """Get average message processing time in seconds."""
        if not self._message_times:
            return 0.0

        total = sum(r.value for r in self._message_times)
        return total / len(self._message_times)

    def get_average_tool_time(self) -> float:
        """Get average tool execution time in milliseconds."""
        if not self._tool_executions:
            return 0.0

        total = sum(r.value for r in self._tool_executions)
        return total / len(self._tool_executions)

    def get_error_rate(self) -> float:
        """Get error rate as percentage."""
        total_events = self._total_messages + self._total_tools_executed
        if total_events == 0:
            return 0.0

        return (self._total_errors / total_events) * 100

    def get_tool_execution_stats(self, tool_name: str = None) -> Dict[str, Any]:
        """Get statistics for tool executions."""
        if tool_name:
            records = [
                r for r in self._tool_executions
                if r.metadata.get('tool_name') == tool_name
            ]
        else:
            records = list(self._tool_executions)

        if not records:
            return {
                'count': 0,
                'avg_time_ms': 0,
                'success_rate': 100.0
            }

        success_count = sum(1 for r in records if r.metadata.get('success'))
        times = [r.value for r in records]

        return {
            'count': len(records),
            'avg_time_ms': sum(times) / len(times),
            'min_time_ms': min(times),
            'max_time_ms': max(times),
            'success_rate': (success_count / len(records)) * 100
        }

    def get_summary(self) -> Dict[str, Any]:
        """Get a summary of all metrics."""
        uptime = (datetime.now() - self._start_time).total_seconds()

        return {
            'agent_id': self.agent_id,
            'uptime_seconds': uptime,
            'total_messages': self._total_messages,
            'total_tools_executed': self._total_tools_executed,
            'total_errors': self._total_errors,
            'active_sessions': len(self._session_counts),
            'avg_message_time_seconds': self.get_average_message_time(),
            'avg_tool_time_ms': self.get_average_tool_time(),
            'error_rate_percent': self.get_error_rate(),
            'tool_stats': self.get_tool_execution_stats()
        }

    def get_recent_activity(self, limit: int = 10) -> List[Dict]:
        """Get recent activity records."""
        all_records = list(self._message_times) + list(self._tool_executions) + list(self._errors)
        all_records.sort(key=lambda r: r.timestamp, reverse=True)
        return [
            {
                'timestamp': r.timestamp,
                'type': r.metric_type,
                'value': r.value,
                'metadata': r.metadata
            }
            for r in all_records[:limit]
        ]

    def reset(self):
        """Reset all metrics."""
        self._message_times.clear()
        self._tool_executions.clear()
        self._errors.clear()
        self._total_messages = 0
        self._total_tools_executed = 0
        self._total_errors = 0
        self._start_time = datetime.now()
        self.logger.info(f"Metrics reset for agent {self.agent_id}")
