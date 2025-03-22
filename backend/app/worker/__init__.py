"""
Worker module for background processing tasks.
"""

from app.worker.analysis_worker import start_workers

__all__ = ["start_workers"]