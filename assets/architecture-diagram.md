# Architecture Diagrams

Diagrams for the AI-Powered Funding & Opportunities Intelligence Agent. They render natively on GitHub (Mermaid).

## 1. System context

```mermaid
flowchart LR
    subgraph Sources["External sources"]
        WEB["Web search API"]
        OFF["Official funder sites"]
        LI["LinkedIn research post<br/>(manual import if blocked)"]
    end
    subgraph Platform["Base44 app (implementation target)"]
        DB[("Entities / database")]
        FN["Backend functions"]
        AUTO["Scheduled and entity automations"]
        AI["AI integration"]
        UI["Pages: pipeline, Email Studio, approval queue"]
    end
    GM["Gmail"]
    HUMAN(["Authorised approvers"])

    WEB --> FN
    OFF --> FN
    LI --> FN
    AUTO --> FN
    FN <--> DB
    FN <--> AI
    UI <--> DB
    UI --> HUMAN
    HUMAN -- "approve" --> FN
    FN -- "send only after approval" --> GM
    GM -- "reply detection" --> FN
```

## 2. Workflow pipeline

```mermaid
flowchart TD
    W1["WF-01 Discovery<br/>daily 06:00"] --> W2["WF-02 Verification"]
    W2 -- verified --> W3["WF-03 Scoring and ranking"]
    W2 -- needs_review --> RQ["Human review queue"]
    W3 --> D{"Human: pursue?"}
    D -- yes --> W4["WF-04 Application preparation"]
    D -- no --> ARC["Archive or monitor"]
    W4 --> R{"Human review"}
    R -- approved --> W5["WF-05 Email generation"]
    W5 --> W6["WF-06 Preview and approval"]
    W6 -- approved --> W7["WF-07 Sending via Gmail"]
    W7 --> W8["WF-08 Follow-ups<br/>weekdays 08:00"]
    W8 -- draft --> W6
    W9["WF-09 Deadline monitoring<br/>daily 07:00"] -.-> W4
    W10["WF-10 Reporting<br/>weekly and monthly"] -.-> W1
```

## 3. Send path with approval gate

```mermaid
sequenceDiagram
    actor U as Approver
    participant S as Email Studio (WF-06)
    participant DB as EmailDraft
    participant F as Send function (WF-07)
    participant G as Gmail

    S->>DB: Save draft (status draft)
    U->>S: Review desktop and mobile preview
    U->>S: Edit or regenerate
    U->>S: Approve
    S->>DB: status approved + approvedBy + contentHash
    DB-->>F: Entity automation fires
    F->>F: Re-verify approver and recompute hash
    alt DRY_RUN is true
        F->>DB: Log dry run, stop
    else live
        F->>G: Send multipart HTML and text
        G-->>F: messageId, threadId
        F->>DB: SentEmail + first FollowUp (+5 business days)
    end
```

## 4. Follow-up timeline

```mermaid
timeline
    title Follow-up cadence (business days)
    Day 0 : Initial email sent
    Day 5 : First follow-up due (5 after initial)
    Day 15 : Second follow-up due (10 after first)
    Day 30 : Final follow-up due (15 after second)
    Any time : Stops on reply, closed opportunity or passed deadline
```

The Day 15 and Day 30 labels assume each follow-up is sent exactly on its due date. In the system every interval is counted from the actual send date of the previous message.
