"""
Skill/Plugin System - Dynamic skill loading and management.
"""

import importlib.util
import logging
import sys
from typing import Dict, List, Any, Optional, Type
from dataclasses import dataclass, field
from pathlib import Path
from abc import ABC, abstractmethod


@dataclass
class SkillMetadata:
    """Metadata for a skill."""
    name: str
    version: str = "1.0.0"
    description: str = ""
    author: str = "unknown"
    capabilities: List[str] = field(default_factory=list)
    when_to_use: str = ""  # Guidance for the LLM on when to activate this skill
    dependencies: List[str] = field(default_factory=list)
    config_schema: Dict[str, Any] = field(default_factory=dict)


class Skill(ABC):
    """
    Abstract base class for all skills.

    Skills provide extended capabilities to the AI agent.
    """

    def __init__(self, metadata: SkillMetadata):
        self.metadata = metadata
        self.name = metadata.name
        self.version = metadata.version
        self.description = metadata.description
        self.author = metadata.author
        self.capabilities = metadata.capabilities
        self.when_to_use = metadata.when_to_use
        self.dependencies = metadata.dependencies
        self.is_active = False
        self.config: Dict[str, Any] = {}
        self.logger = logging.getLogger(f"skill.{metadata.name}")

    @abstractmethod
    async def initialize(self, config: Dict[str, Any] = None) -> bool:
        """Initialize the skill with configuration."""
        pass

    @abstractmethod
    async def execute(self, action: str, params: Dict[str, Any]) -> Dict:
        """
        Execute a skill action.

        Args:
            action: Action name to execute
            params: Action parameters

        Returns:
            Execution result dictionary
        """
        pass

    async def activate(self, config: Dict[str, Any] = None) -> bool:
        """Activate the skill."""
        if not self.is_active:
            success = await self.initialize(config or {})
            if success:
                self.is_active = True
                self.logger.info(f"Skill '{self.name}' activated")
        return self.is_active

    async def deactivate(self) -> bool:
        """Deactivate the skill."""
        if self.is_active:
            self.is_active = False
            self.logger.info(f"Skill '{self.name}' deactivated")
        return True


class SkillLoader:
    """
    Dynamic skill loader that supports multiple skill types.

    Features:
    - Load skills from filesystem
    - Support for Python-based skills
    - Skill dependency resolution
    - Skill activation/deactivation
    """

    def __init__(self, skills_dir: str = "./skills"):
        self.skills_dir = Path(skills_dir)
        self.loaded_skills: Dict[str, Skill] = {}
        self.active_skills: Dict[str, Skill] = {}
        self.skill_dependencies: Dict[str, List[str]] = {}
        self.logger = logging.getLogger("skill_loader")
        self._skill_classes: Dict[str, Type[Skill]] = {}

    async def initialize(self) -> bool:
        """Initialize the skill loader."""
        try:
            # Ensure skills directory exists
            self.skills_dir.mkdir(parents=True, exist_ok=True)

            # Scan for skill files
            await self._scan_skills()

            self.logger.info(f"Skill Loader initialized. Found {len(self._skill_classes)} skill classes")
            return True

        except Exception as e:
            self.logger.error(f"Failed to initialize Skill Loader: {e}")
            return False

    async def _scan_skills(self):
        """Scan skills directory for skill definitions."""
        if not self.skills_dir.exists():
            return

        # Look for Python files
        for skill_file in self.skills_dir.glob("*.py"):
            if skill_file.name.startswith("_"):
                continue

            try:
                await self._load_skill_module(skill_file)
            except Exception as e:
                self.logger.warning(f"Failed to load skill module {skill_file}: {e}")

    async def _load_skill_module(self, skill_path: Path):
        """Load a skill module from file and register Skill subclasses."""
        module_name = skill_path.stem
        spec = importlib.util.spec_from_file_location(module_name, skill_path)
        if spec and spec.loader:
            module = importlib.util.module_from_spec(spec)
            sys.modules[module_name] = module
            spec.loader.exec_module(module)

            # Register all Skill subclasses, keyed by class name
            for attr_name in dir(module):
                attr = getattr(module, attr_name)
                if (
                    isinstance(attr, type)
                    and issubclass(attr, Skill)
                    and attr is not Skill
                ):
                    self._skill_classes[attr_name] = attr
                    self.logger.debug(f"Found skill class: {attr_name}")

    def _skill_class_for_file(self, skill_path: Path):
        """Find the best matching Skill class for a skill file."""
        stem = skill_path.stem  # e.g. "web_search"

        # Direct match by class name
        if stem in self._skill_classes:
            return stem

        # Convert snake_case to PascalCase + "Skill" suffix
        # e.g. "web_search" -> "WebSearchSkill"
        pascal = "".join(w.capitalize() for w in stem.split("_"))
        for suffix in ("Skill", ""):
            candidate = pascal + suffix
            if candidate in self._skill_classes:
                return candidate

        # Fallback: return first class whose source file matches
        for name, cls in self._skill_classes.items():
            cls_file = getattr(getattr(cls, "__module__", None), "__file__", None)
            if cls_file and Path(cls_file).stem == stem:
                return name

        return None

    async def load_skill(self, skill_path: Path) -> Optional[Skill]:
        """
        Load a skill from filesystem.

        Args:
            skill_path: Path to skill file

        Returns:
            Loaded Skill instance or None
        """
        if not skill_path.exists():
            self.logger.warning(f"Skill not found: {skill_path}")
            return None

        skill_name = skill_path.stem

        # Already loaded? Return existing instance.
        if skill_name in self.loaded_skills:
            return self.loaded_skills[skill_name]

        try:
            # Load module (registers skill classes into _skill_classes)
            await self._load_skill_module(skill_path)

            # Find the skill class matching the filename
            skill_class_name = self._skill_class_for_file(skill_path)
            if skill_class_name:
                skill_class = self._skill_classes[skill_class_name]
                skill_name = skill_class_name
            else:
                # Fallback: find any Skill subclass not yet loaded
                skill_class = None
                skill_name = None
                for name, cls in self._skill_classes.items():
                    if name not in self.loaded_skills:
                        skill_class = cls
                        skill_name = name
                        break

            if not skill_class:
                self.logger.warning(f"No skill class found in {skill_path}")
                return None

            # Create instance
            skill = skill_class(
                metadata=SkillMetadata(
                    name=skill_class.__name__,
                    version="1.0.0",
                    description=f"Skill: {skill_class.__name__}",
                    capabilities=[]
                )
            )

            self.loaded_skills[skill_name] = skill
            self.logger.info(f"Loaded skill: {skill_name}")
            return skill

        except Exception as e:
            self.logger.error(f"Failed to load skill {skill_path}: {e}")
            return None

    async def unload_skill(self, skill_id: str) -> bool:
        """Unload a skill."""
        if skill_id in self.active_skills:
            await self.active_skills[skill_id].deactivate()
            del self.active_skills[skill_id]

        if skill_id in self.loaded_skills:
            del self.loaded_skills[skill_id]

        self.logger.info(f"Unloaded skill: {skill_id}")
        return True

    async def activate_skill(
        self,
        skill_id: str,
        config: Dict[str, Any] = None
    ) -> bool:
        """
        Activate a loaded skill.

        Args:
            skill_id: Skill identifier
            config: Optional configuration

        Returns:
            True if activation successful
        """
        if skill_id not in self.loaded_skills:
            self.logger.warning(f"Skill not loaded: {skill_id}")
            return False

        # Check dependencies
        skill = self.loaded_skills[skill_id]
        for dep in skill.dependencies:
            if dep not in self.active_skills:
                self.logger.warning(f"Dependency not met for skill {skill_id}: {dep}")
                return False

        # Activate skill
        success = await skill.activate(config)
        if success:
            self.active_skills[skill_id] = skill

        return success

    async def deactivate_skill(self, skill_id: str) -> bool:
        """Deactivate a skill."""
        if skill_id not in self.active_skills:
            return False

        skill = self.active_skills[skill_id]
        await skill.deactivate()
        del self.active_skills[skill_id]

        return True

    def list_loaded_skills(self) -> List[str]:
        """List all loaded skill IDs."""
        return list(self.loaded_skills.keys())

    def list_active_skills(self) -> List[str]:
        """List all active skill IDs."""
        return list(self.active_skills.keys())

    def get_skill(self, skill_id: str) -> Optional[Skill]:
        """Get a skill instance."""
        return self.loaded_skills.get(skill_id)

    def get_active_skill(self, skill_id: str) -> Optional[Skill]:
        """Get an active skill instance."""
        return self.active_skills.get(skill_id)

    def get_skill_capabilities(self) -> Dict[str, List[str]]:
        """Return all available skill capabilities."""
        capabilities = {}
        for skill in self.active_skills.values():
            for capability in skill.capabilities:
                if capability not in capabilities:
                    capabilities[capability] = []
                capabilities[capability].append(skill.name)
        return capabilities

    async def execute_skill_action(
        self,
        skill_id: str,
        action: str,
        params: Dict[str, Any]
    ) -> Dict:
        """
        Execute an action on a skill.

        Args:
            skill_id: Skill identifier
            action: Action name
            params: Action parameters

        Returns:
            Execution result
        """
        skill = self.get_active_skill(skill_id)
        if not skill:
            return {
                'success': False,
                'error': f"Skill '{skill_id}' is not active"
            }

        try:
            result = await skill.execute(action, params)
            return {
                'success': True,
                'result': result,
                'skill': skill_id
            }
        except Exception as e:
            self.logger.error(f"Skill action execution error: {e}")
            return {
                'success': False,
                'error': str(e),
                'skill': skill_id
            }
