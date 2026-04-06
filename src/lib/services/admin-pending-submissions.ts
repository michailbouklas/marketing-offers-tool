import type {
  BulkPendingSubmissionDecisionResult,
  PendingSubmissionDecision,
} from "$lib/services/offers-data-quality";

type SingleSubmissionDecisionResponse = {
  staging_id: number;
  status: "approved" | "rejected";
  approved_at?: string;
};

type ApiErrorResponse = {
  error?: string;
};

async function parseJson<T>(response: Response): Promise<T> {
  return (await response.json()) as T;
}

export async function decidePendingSubmission(
  fetchFn: typeof fetch,
  stagingId: number,
  decision: PendingSubmissionDecision,
) {
  const response = await fetchFn(
    `/api/gaps/submissions/${stagingId}/${decision}`,
    {
      method: "POST",
    },
  );

  if (!response.ok) {
    const result = await parseJson<ApiErrorResponse>(response);
    throw new Error(result.error ?? `Unable to ${decision} submission`);
  }

  return parseJson<SingleSubmissionDecisionResponse>(response);
}

export async function bulkDecidePendingSubmissions(
  fetchFn: typeof fetch,
  ids: number[],
  decision: PendingSubmissionDecision,
) {
  const response = await fetchFn("/api/gaps/submissions/bulk", {
    method: "POST",
    headers: {
      "content-type": "application/json",
    },
    body: JSON.stringify({ ids, decision }),
  });

  if (!response.ok) {
    const result = await parseJson<ApiErrorResponse>(response);
    throw new Error(
      result.error ?? `Unable to ${decision} selected submissions`,
    );
  }

  return parseJson<BulkPendingSubmissionDecisionResult>(response);
}
