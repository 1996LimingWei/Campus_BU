# App Review Notes（Guideline 1.2）

以下内容可直接粘贴到 App Store Connect 的 **App Review Information > Notes**：

```text
Hello App Review Team,

Thank you for your feedback regarding Guideline 1.2 (User-Generated Content).

We have updated HKCampus to address the requested safeguards:

1) Terms/EULA gate before UGC access
- Users must accept our community terms before accessing user-generated content.
- The terms explicitly state zero tolerance for objectionable content and abusive users.

2) Objectionable-content filtering
- We added keyword/rule-based filtering in app-side submission checks.
- We also added server-side moderation triggers to block objectionable text before insertion.

3) Report mechanism
- Users can report objectionable content from UGC action menus.
- Reports are stored server-side with moderation workflow fields:
  status, reviewed_by, reviewed_at, resolution, and 24-hour SLA tracking fields.

4) Block mechanism
- Users can block abusive users from content/message action menus.
- Blocked users’ content is removed from feed/detail/comment/message views immediately and filtered on subsequent loads.
- When a user block is created for abuse/safety reasons, it also creates a moderation record for our review team.

5) Moderation operations
- We implemented a moderation workflow with report statuses and audit logs.
- Reports are tracked and handled within 24 hours.
- Moderators can remove reported content and ban offending users from the moderation workbench.

6) Support contact information
- Support contact details are available in app (Profile > Help & Support) and on our support page.

A physical-device screen recording is attached showing:
- EULA acceptance before entering UGC
- Reporting flow
- Blocking flow
- Blocked content disappearing immediately

If any additional test credentials or context is needed, we are happy to provide it.
```
