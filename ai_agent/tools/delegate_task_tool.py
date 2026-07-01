"""
Delegate Task Tool - Generate structured sub-task descriptions for complex task decomposition.

This is a meta-tool that helps the LLM plan and break down complex tasks into
structured sub-task descriptions. It does not actually spawn sub-agents (SiPer
has no sub-agent runtime), but produces a task plan that can be used within
the conversation context.
"""

from typing import Dict, Any, List, Optional
from ..tools.tool_registry import BaseTool, ToolResult, ToolCategory


class DelegateTaskTool(BaseTool):
    """Generate structured sub-task descriptions for complex task decomposition.

    Use this tool when a task is complex enough to benefit from being broken
    into smaller, well-defined sub-tasks. The tool produces a structured plan
    including individual steps, each with its own goal, context, and suggested
    toolsets.
    """

    def __init__(self):
        super().__init__(
            name="delegate_task",
            description=(
                "Generate a structured sub-task plan for complex task decomposition. "
                "When a task is too complex to complete in a single pass, use this tool "
                "to break it into smaller, well-defined steps. Each step includes a goal, "
                "optional context, and suggested toolsets. "
                "This is a meta-tool — it does not spawn sub-agents, only produces a plan "
                "for the LLM to execute sequentially within the conversation."
            ),
            schema={
                "type": "object",
                "properties": {
                    "goal": {
                        "type": "string",
                        "description": "The overall goal to be accomplished — a clear description of what the complex task should achieve."
                    },
                    "context": {
                        "type": "string",
                        "description": (
                            "Optional additional context about the task environment, "
                            "constraints, prerequisites, or background information that "
                            "will help in planning the sub-tasks."
                        )
                    },
                    "toolsets": {
                        "type": "array",
                        "items": {
                            "type": "string"
                        },
                        "description": (
                            "Optional list of toolset names needed for sub-tasks "
                            "(e.g. ['file', 'web', 'core']). Defaults to ['core']."
                        )
                    }
                },
                "required": ["goal"]
            },
            toolsets=["core"],
            category=ToolCategory.UTILITY
        )

    async def execute(self, parameters: Dict[str, Any]) -> ToolResult:
        goal: str = parameters.get("goal", "").strip()
        context: Optional[str] = parameters.get("context")
        toolsets: List[str] = parameters.get("toolsets") or ["core"]

        if not goal:
            return ToolResult(
                success=False,
                error="Parameter 'goal' is required and must be a non-empty string."
            )

        # Build a structured task plan
        task_plan = self._build_task_plan(goal, context, toolsets)

        return ToolResult(
            success=True,
            data=task_plan,
            metadata={
                "tool": "delegate_task",
                "goal": goal,
                "step_count": len(task_plan["steps"])
            }
        )

    def _build_task_plan(
        self,
        goal: str,
        context: Optional[str],
        toolsets: List[str]
    ) -> Dict[str, Any]:
        """Build a structured task plan from the given parameters.

        The plan includes an overview and a list of steps. Each step is a
        self-contained sub-task with its own goal, context, and toolsets.
        """
        steps: List[Dict[str, Any]] = []

        # Step 1: Understand and analyze the task
        steps.append({
            "step": 1,
            "goal": f"Analyze and understand the task: {goal}",
            "context": (
                context or "Review the task requirements carefully. "
                "Identify key components, dependencies, and potential challenges."
            ),
            "toolsets": toolsets,
            "description": (
                "Break down the overall goal into actionable components. "
                "Identify what information, resources, or tools are needed."
            )
        })

        # Step 2: Execute the main work
        steps.append({
            "step": 2,
            "goal": f"Execute the main task: {goal}",
            "context": context or "Carry out the primary work based on the analysis from step 1.",
            "toolsets": toolsets,
            "description": (
                "Perform the core work required to achieve the goal. "
                "Use the appropriate tools for each sub-problem identified."
            )
        })

        # Step 3: Verify and review
        steps.append({
            "step": 3,
            "goal": f"Verify completion: {goal}",
            "context": (
                "Review the work done in step 2 against the original goal. "
                "Check for completeness, correctness, and any remaining issues."
            ),
            "toolsets": toolsets,
            "description": (
                "Quality check — ensure all parts of the goal have been addressed. "
                "Fix any issues found during review."
            )
        })

        return {
            "task_plan": {
                "goal": goal,
                "context": context,
                "toolsets": toolsets,
                "total_steps": len(steps)
            },
            "steps": steps
        }
