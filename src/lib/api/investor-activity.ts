export type InteractionKind =
  | 'page_view'
  | 'question_asked'
  | 'email_sent'
  | 'email_received'
  | 'document_viewed'
  | 'meeting_held'
  | 'note'
  | 'stage_change'
  | 'email_verified';

export type Interaction = {
  id: string;
  kind: InteractionKind;
  payload: Record<string, unknown>;
  createdAt: string;
};

export type InvestorActivity = {
  investor: {
    id: string;
    firstName: string;
    lastName: string;
    email: string;
    emailVerifiedAt: string | null;
    lastContactAt: string | null;
  };
  summary: {
    questionsAsked: number;
    refusedCount: number;
    lastQuestionAt: string | null;
    topTopics: Array<{ topic: string; count: number }>;
  };
  interactions: Interaction[];
};

export async function getInvestorActivity(investorId: string): Promise<InvestorActivity> {
  const res = await fetch(
    `/api/v1/admin/investors/${encodeURIComponent(investorId)}/interactions`,
    { credentials: 'include' },
  );
  if (!res.ok) {
    const data = (await res.json().catch(() => null)) as { title?: string } | null;
    throw new Error(data?.title ?? `Failed (${res.status})`);
  }
  return (await res.json()) as InvestorActivity;
}
