import {
  AdminUser,
  AuthResponse,
  Application,
  ApplicantUser,
  Slot,
  FormQuestionsResponse,
  ReviewPayload,
  CreateSlotPayload,
  DomainEnum,
  Subsection,
  Question,
} from "./types";

const getAuthHeaders = (): HeadersInit => {
  const token = typeof window !== "undefined" ? localStorage.getItem("admin_token") : null;
  return {
    "Content-Type": "application/json",
    ...(token ? { Authorization: `Bearer ${token}` } : {}),
  };
};

async function handleResponse<T>(res: Response): Promise<T> {
  const data = await res.json();
  if (!res.ok || data.success === false) {
    if (res.status === 401 || res.status === 403) {
      if (typeof window !== "undefined") {
        localStorage.removeItem("admin_token");
        localStorage.removeItem("admin_user");
        window.location.href = "/login?msg=session_expired";
      }
    }
    throw new Error(data.message || "An error occurred");
  }
  return data.data !== undefined ? data.data : data;
}

export const adminApi = {
  async login(email: string, password: string): Promise<AuthResponse> {
    const res = await fetch("/api/admin/login", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ email, password }),
    });
    return handleResponse<AuthResponse>(res);
  },

  async setup(email: string, password: string, name?: string): Promise<AuthResponse> {
    const res = await fetch("/api/admin/setup", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ email, password, name }),
    });
    return handleResponse<AuthResponse>(res);
  },

  async getApplicants(domain: string = "ALL"): Promise<Application[]> {
    const res = await fetch(`/api/admin/applicants?domain=${encodeURIComponent(domain)}`, {
      headers: getAuthHeaders(),
    });
    return handleResponse<Application[]>(res);
  },

  async getApplication(applicationId: string): Promise<Application> {
    // Queries applicants dataset for application record by identifier
    const all = await this.getApplicants("ALL");
    const found = all.find((a) => a.id === applicationId);
    if (!found) {
      const err: any = new Error("Application not found");
      err.status = 404;
      throw err;
    }
    return found;
  },

  async getApplicantById(userId: string): Promise<ApplicantUser> {
    const res = await fetch(`/api/admin/applicants/${encodeURIComponent(userId)}`, {
      headers: getAuthHeaders(),
    });
    return handleResponse<ApplicantUser>(res);
  },

  async updateReview(applicationId: string, payload: ReviewPayload): Promise<Application> {
    const res = await fetch(`/api/admin/applicants/${encodeURIComponent(applicationId)}/review`, {
      method: "PUT",
      headers: getAuthHeaders(),
      body: JSON.stringify(payload),
    });
    return handleResponse<Application>(res);
  },

  async createSlots(payload: CreateSlotPayload): Promise<{ success: boolean; message: string }> {
    const res = await fetch("/api/admin/slots", {
      method: "POST",
      headers: getAuthHeaders(),
      body: JSON.stringify(payload),
    });
    return handleResponse<{ success: boolean; message: string }>(res);
  },

  async getSchedule(adminId: string = "ALL", all: boolean = true, domain?: string): Promise<Slot[]> {
    let url = `/api/admin/schedule/${encodeURIComponent(adminId)}?all=${all}`;
    if (domain) {
      url += `&domain=${encodeURIComponent(domain)}`;
    }
    const res = await fetch(url, {
      headers: getAuthHeaders(),
    });
    return handleResponse<Slot[]>(res);
  },

  async getForm(domain?: string): Promise<FormQuestionsResponse> {
    let url = "/api/admin/form";
    if (domain) {
      url += `?domain=${encodeURIComponent(domain)}`;
    }
    const res = await fetch(url, {
      headers: getAuthHeaders(),
    });
    return handleResponse<FormQuestionsResponse>(res);
  },

  async createSubsection(name: string, domain?: DomainEnum, order: number = 0): Promise<Subsection> {
    const res = await fetch("/api/admin/form/subsection", {
      method: "POST",
      headers: getAuthHeaders(),
      body: JSON.stringify({ name, domain, order }),
    });
    return handleResponse<Subsection>(res);
  },

  async createQuestion(payload: Partial<Question>): Promise<Question> {
    const res = await fetch("/api/admin/form/question", {
      method: "POST",
      headers: getAuthHeaders(),
      body: JSON.stringify(payload),
    });
    return handleResponse<Question>(res);
  },

  async deleteSlot(slotId: string): Promise<{ success: boolean; message: string }> {
    const res = await fetch(`/api/admin/slots/${encodeURIComponent(slotId)}`, {
      method: "DELETE",
      headers: getAuthHeaders(),
    });
    return handleResponse<{ success: boolean; message: string }>(res);
  },

  async updateSlot(slotId: string, payload: { meetingLink?: string }): Promise<Slot> {
    const res = await fetch(`/api/admin/slots/${encodeURIComponent(slotId)}`, {
      method: "PATCH",
      headers: getAuthHeaders(),
      body: JSON.stringify(payload),
    });
    return handleResponse<Slot>(res);
  },

  async updateQuestion(id: string, payload: Partial<Question>): Promise<Question> {
    const res = await fetch(`/api/admin/form/question/${encodeURIComponent(id)}`, {
      method: "PUT",
      headers: getAuthHeaders(),
      body: JSON.stringify(payload),
    });
    return handleResponse<Question>(res);
  },

  async deleteQuestion(id: string): Promise<{ success: boolean }> {
    const res = await fetch(`/api/admin/form/question/${encodeURIComponent(id)}`, {
      method: "DELETE",
      headers: getAuthHeaders(),
    });
    return handleResponse<{ success: boolean }>(res);
  },

  async updateSubsection(id: string, name: string, order?: number): Promise<Subsection> {
    const res = await fetch(`/api/admin/form/subsection/${encodeURIComponent(id)}`, {
      method: "PUT",
      headers: getAuthHeaders(),
      body: JSON.stringify({ name, order }),
    });
    return handleResponse<Subsection>(res);
  },

  async deleteSubsection(id: string): Promise<{ success: boolean }> {
    const res = await fetch(`/api/admin/form/subsection/${encodeURIComponent(id)}`, {
      method: "DELETE",
      headers: getAuthHeaders(),
    });
    return handleResponse<{ success: boolean }>(res);
  },

  async getDomainHeads(): Promise<any[]> {
    const res = await fetch("/api/admin/domain-heads", {
      headers: getAuthHeaders(),
    });
    return handleResponse<any[]>(res);
  },

  async addDomainHeads(
    emails: string[] | string,
    domain: DomainEnum
  ): Promise<{ message: string; assignedEmails: string[]; alreadyExisting?: string[] }> {
    const res = await fetch("/api/admin/domain-heads", {
      method: "POST",
      headers: getAuthHeaders(),
      body: JSON.stringify({ emails, domain }),
    });
    return handleResponse<{ message: string; assignedEmails: string[]; alreadyExisting?: string[] }>(res);
  },

  async getRound1Summary(domain?: string): Promise<{
    undecided: number;
    pendingShortlist: number;
    pendingReject: number;
    sentShortlist: number;
    sentReject: number;
  }> {
    const query = domain && domain !== "ALL" ? `?domain=${encodeURIComponent(domain)}` : "";
    const res = await fetch(`/api/admin/round1/summary${query}`, {
      headers: getAuthHeaders(),
    });
    return handleResponse(res);
  },

  async getRound1Templates(decision?: string): Promise<any> {
    const query = decision ? `?decision=${encodeURIComponent(decision)}` : "";
    const res = await fetch(`/api/admin/round1/templates${query}`, {
      headers: getAuthHeaders(),
    });
    return handleResponse(res);
  },

  async sendRound1Emails(payload: {
    domain: string;
    decision: "SHORTLIST" | "REJECT";
    subject: string;
    body: string;
    limit?: number;
  }): Promise<{ processed: number; sent: number; failed: any[]; remaining: number }> {
    const res = await fetch(`/api/admin/round1/send`, {
      method: "POST",
      headers: getAuthHeaders(),
      body: JSON.stringify(payload),
    });
    return handleResponse(res);
  },
};
