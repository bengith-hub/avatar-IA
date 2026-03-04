from __future__ import annotations

import uuid
from datetime import datetime, timezone

from models import GenerateRequest, JobStatus, JobStatusResponse, JobListItem


class JobManager:
    def __init__(self) -> None:
        self._jobs: dict[str, dict] = {}

    def create_job(self, request: GenerateRequest) -> str:
        job_id = uuid.uuid4().hex[:12]
        now = datetime.now(timezone.utc)
        self._jobs[job_id] = {
            "job_id": job_id,
            "status": JobStatus.pending,
            "progress": 0.0,
            "result_url": None,
            "error": None,
            "created_at": now,
            "updated_at": now,
            "request": request.model_dump(),
        }
        return job_id

    def get_job(self, job_id: str) -> JobStatusResponse | None:
        job = self._jobs.get(job_id)
        if job is None:
            return None
        return JobStatusResponse(
            job_id=job["job_id"],
            status=job["status"],
            progress=job["progress"],
            result_url=job["result_url"],
            error=job["error"],
            created_at=job["created_at"],
            updated_at=job["updated_at"],
        )

    def update_job(
        self,
        job_id: str,
        *,
        status: JobStatus | None = None,
        progress: float | None = None,
        result_url: str | None = None,
        error: str | None = None,
    ) -> None:
        job = self._jobs.get(job_id)
        if job is None:
            return
        if status is not None:
            job["status"] = status
        if progress is not None:
            job["progress"] = progress
        if result_url is not None:
            job["result_url"] = result_url
        if error is not None:
            job["error"] = error
        job["updated_at"] = datetime.now(timezone.utc)

    def list_jobs(self, limit: int = 50) -> list[JobListItem]:
        sorted_jobs = sorted(
            self._jobs.values(), key=lambda j: j["created_at"], reverse=True
        )
        return [
            JobListItem(
                job_id=j["job_id"],
                status=j["status"],
                created_at=j["created_at"],
                text_preview=j["request"]["text"][:80],
            )
            for j in sorted_jobs[:limit]
        ]


job_manager = JobManager()
