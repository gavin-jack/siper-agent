from setuptools import setup, find_packages

setup(
    name="siper-agent",
    version="0.1.7",
    description="An independent AI Agent framework with multi-model, multi-skill, and Web UI support",
    long_description=open("README.md", encoding="utf-8").read(),
    long_description_content_type="text/markdown",
    author="Gavin",
    license="MIT",
    python_requires=">=3.10",
    packages=find_packages(include=["ai_agent", "ai_agent.*"]),
    py_modules=["siper_web"],
    install_requires=[
        "openai>=1.0",
        "websockets>=15.0",
        "jinja2>=3.1",
    ],
    extras_require={
        "dev": [
            "pytest>=7.0",
        ],
    },
    entry_points={
        "console_scripts": [
            "siper=siper_web:main",
        ],
    },
    classifiers=[
        "Development Status :: 3 - Alpha",
        "Intended Audience :: Developers",
        "License :: OSI Approved :: MIT License",
        "Programming Language :: Python :: 3",
        "Programming Language :: Python :: 3.10",
        "Programming Language :: Python :: 3.11",
        "Programming Language :: Python :: 3.12",
        "Topic :: Scientific/Engineering :: Artificial Intelligence",
    ],
    project_urls={
        "Source": "https://github.com/gavin-jack/siper-agent",
    },
)
