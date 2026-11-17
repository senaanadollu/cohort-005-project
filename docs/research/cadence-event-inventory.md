# Cadence event inventory: who else is affected

Research for issue #4, "Which events already happen in Cadence that someone other than the actor would want to know about?" (parent map: issue #2, in-app notifications).

This is an inventory, not a recommendation. Weak candidates are listed alongside strong ones and nothing here says which deserve a notification.

## Source and how to read the citations

- **Code read**: the local `main` branch at commit `979e285` ("add-wayfinder-skill"). That commit is **six commits ahead of `origin/main` (`13465da`) and is not pushed**. `origin/main` has no `app/lib/mailer.server.ts`, `app/lib/refunds.server.ts`, `app/routes/admin.refunds.tsx` or `docs/adr/`, and its `GLOSSARY.md` has no People section. The ticket names those files, so the inventory follows local `main`.
- Every `file:line` below is a line number in the file **as it is at `979e285`**. Line numbers will not match `origin/main` or this branch (this branch is cut from `13465da` and holds only this file).
- **Sweep**: every route in `app/routes.ts`, every `export async function action` (21 routes have one), `app/lib/*`, `app/db/schema.ts`, `GLOSSARY.md`, `docs/adr/0001`–`0006`, `0009`, `0011`.
- **People** are named as in `GLOSSARY.md`: Student, Instructor, Platform Admin, Team Admin. In the code a Platform Admin is `users.role = "admin"` (`app/db/schema.ts:11-15`), an Instructor is the `courses.instructor_id` owner, and a Team Admin is a `team_members` row with role `admin` (`app/db/schema.ts:40-43`, `266-278`).
- **"Email today"** means a call to `sendEmail` (`app/lib/mailer.server.ts:67`). There are exactly two call sites in the app: `app/routes/courses.$slug.refund.ts:75` and `app/routes/admin.refunds.tsx:130`. Everything else sends nothing.
- **Fan-out** is how many people one occurrence reaches. **Frequency** is how often it can recur in a short span.

## Emails that exist today

| Email | Sent to | Sent when | Where |
| --- | --- | --- | --- |
| "Refund requested — {course}" | The buyer who raised the Refund Request (the actor) | A Refund Request is raised | built `app/lib/refunds.server.ts:394-407`, sent `app/routes/courses.$slug.refund.ts:75` |
| "Refund approved — {course}" | The buyer | A Platform Admin approves the Refund Request | built `app/lib/refunds.server.ts:736-781`, sent `app/routes/admin.refunds.tsx:130` |
| "Refund declined — {course}" | The buyer | A Platform Admin declines the Refund Request | same as above |

No email goes to a Platform Admin, an Instructor, or a Team Admin acting as anything other than the buyer of a Refund Request. `enrollUser` has a `sendEmail` flag whose body is the comment "Would send welcome email here" (`app/routes/courses.$slug.purchase.tsx:173-175`) and it is always called with `false` (`:371`), so there is no welcome or purchase email.

## Inventory

47 events: 19 under Student, 16 under Instructor, 8 under Platform Admin, 4 under Team Admin. Each is listed once, under the person most directly affected; the "Affected" column names anyone else it touches.

### Affects a Student

| # | What happened | Caused by | Affected | Where | Email today | Fan-out / frequency |
| --- | --- | --- | --- | --- | --- | --- |
| S1 | An Instructor or Platform Admin replies to a Student's question (top-level lesson comment) from the Unanswered Questions queue | Instructor of the course, or Platform Admin | The Student who asked | `app/routes/instructor.questions.tsx:188-225` (insert `:152-156`) | No | One Student. One per reply; several staff replies to one question are possible |
| S2 | Someone replies to a Student's comment on the lesson page (replies are one level deep) | Another Student with an Enrollment, the Instructor, or a Platform Admin | The author of the parent comment | `app/routes/courses.$slug.lessons.$lessonId.tsx:898-910` (`createComment` `:404-435`) | No | One person per reply. A busy thread can produce many replies in minutes |
| S3 | A further reply lands in a thread the Student has already replied in | Any person who can view the lesson | Every earlier replier in the thread (weak: the code has no notion of thread participants) | same as S2 | No | Grows with thread size; repeats on every reply |
| S4 | A new top-level comment is posted on a lesson of a course the Student is enrolled on (includes an Instructor posting one) | Student, Instructor or Platform Admin | Every Student with an Enrollment on the course (weak); also the Instructor, see I4 | same as S2 | No | Every enrolled Student. Unbounded frequency |
| S5 | A Student's comment is deleted by someone else (soft delete, `deleted_at`) | Instructor of the course or Platform Admin (`isStaff`) | The comment's author | `app/routes/courses.$slug.lessons.$lessonId.tsx:927-936` (`deleteComment` `:459-477`) | No | One Student per deletion. Rare |
| S6 | A Refund Request on an Individual Purchase is approved. The Student loses their Enrollment unless they also hold a Claimed Seat for the course; progress is kept (ADR 0001, 0002, 0004) | Platform Admin | The Student who bought. Also the Instructor (I10) | `app/routes/admin.refunds.tsx:109-117`, `app/lib/refunds.server.ts:614-685` (Enrollment deleted `:658-665`) | **Yes**, to the buyer | One Student. Once per Purchase (an approved Purchase cannot be requested again, `:290-296`) |
| S7 | A Refund Request on an Individual Purchase is declined, with a required note. Nothing is lost; the Student may raise another | Platform Admin | The Student who bought | `app/routes/admin.refunds.tsx:118-124`, `app/lib/refunds.server.ts:692-733` | **Yes**, to the buyer | One Student. Can repeat: raise, decline, raise again while still eligible |
| S8 | A course the Student is enrolled on changes status (Published, Draft, Archived) | Instructor of the course, or Platform Admin | Every Student with an Enrollment on it; Team Admins holding a Team Licence for it; Students holding an Unclaimed Seat link. Status only gates the catalogue and the purchase page loader (`app/routes/courses.tsx:288`, `app/routes/courses.$slug.purchase.tsx:286`); no other check was found | `app/routes/instructor.$courseId.tsx:695` and `app/routes/admin.courses.tsx:141-144` | No | Every enrolled Student at once. Can be toggled repeatedly |
| S9 | A lesson or module is added to a course the Student is enrolled on. Lessons have no draft state, so on a Published course it is live immediately | Instructor, or Platform Admin | Every Student with an Enrollment on the course | `app/routes/instructor.$courseId.tsx:722` (add-module), `:753` (add-lesson) | No | Every enrolled Student. An Instructor building a module adds many lessons in a few minutes |
| S10 | A lesson's content, video, repo link or duration is edited | Instructor, or Platform Admin | Every Student with an Enrollment on the course | `app/routes/instructor.$courseId.lessons.$lessonId.tsx:207-226` | No | Every enrolled Student. Saved repeatedly while editing |
| S11 | A lesson or module is renamed, reordered or moved (weak) | Instructor, or Platform Admin | Every Student with an Enrollment on the course | `app/routes/instructor.$courseId.tsx:727` (rename-module), `:766` (rename-lesson), `:783` (reorder-modules), `:789` (reorder-lessons), `:803` (move-lesson) | No | Every enrolled Student. Drag-and-drop fires one per move |
| S12 | A lesson or a whole module is deleted. The lesson rows go; Students' progress, comments and watch events for them are left behind | Instructor, or Platform Admin | Every Student with an Enrollment, most directly those with progress or comments on it | `app/routes/instructor.$courseId.tsx:740` (delete-module, `deleteModule` `:236-240`), `:827` (delete-lesson, `deleteLesson` `:304-306`) | No | Every enrolled Student. Deleting a module removes all its lessons in one action |
| S13 | A lesson's quiz is saved or deleted. Saving replaces the quiz: the old one is deleted along with **every Student's attempts and answers** for it | Instructor, or Platform Admin | Every Student with an Enrollment; most directly those who had attempted or passed it | `app/routes/instructor.$courseId.lessons.$lessonId.quiz.tsx:386` (save-quiz), `:425` (delete-quiz), `deleteQuiz` `:201-219` | No | Every enrolled Student. Repeats on every save |
| S14 | A course's title, description or sales copy is edited (weak) | Instructor, or Platform Admin | Students with an Enrollment; prospective Students | `app/routes/instructor.$courseId.tsx:685`, `:690`, `:844` | No | Everyone who can see the course. Inline edits, so frequent |
| S15 | A course's price or its purchasing-power pricing switch changes (weak: nothing records who is interested in a course they have not bought) | Instructor, or Platform Admin | Prospective Students and Team Admins | `app/routes/instructor.$courseId.tsx:700` (update-price), `:716` (update-ppp-enabled) | No | Unknown audience. Occasional |
| S16 | A course is published and appears in the catalogue (weak; the same action as S8 seen by people not enrolled) | Instructor, or Platform Admin | Every Student | `app/routes/instructor.$courseId.tsx:695`, `app/routes/admin.courses.tsx:141-144` | No | Every Student on the platform. Rare |
| S17 | A person's role is changed (Student, Instructor, Platform Admin) | Platform Admin | The person whose role changed; they gain or lose whole areas of the app | `app/routes/admin.users.tsx:126-130` | No | One person. Rare |
| S18 | A person's name or email address is edited by someone else | Platform Admin | The person edited. The email address is where their refund emails go | `app/routes/admin.users.tsx:119-124` | No | One person. Rare |
| S19 | The Seat a Student was sent goes on hold (the Team Licence has an Open Refund Request) or can never be claimed (the request was approved) | Team Admin raising the request; Platform Admin approving it | A Student holding an Unclaimed Seat link. **Cadence has no record of who that is**: a Seat is a code in a URL, and a person is attached to it only when it is claimed | on hold: `app/lib/refunds.server.ts:111-121`; refunded: `:638-643`; the Student finds out at `app/routes/redeem.$code.tsx:61-67` | No | Every Unclaimed Seat on the licence, but with no known recipient |

### Affects an Instructor

| # | What happened | Caused by | Affected | Where | Email today | Fan-out / frequency |
| --- | --- | --- | --- | --- | --- | --- |
| I1 | A Student makes an Individual Purchase of the Instructor's course and gets an Enrollment | Student | The Instructor (new Student on the roster, revenue); Platform Admins see it in analytics | `app/routes/courses.$slug.purchase.tsx:366-373` (`createPurchase` `:370`, `enrollUser` `:371`) | No (stub only, `:173-175`) | One Instructor. Unbounded: a launch or sale produces many in a short span |
| I2 | A Team Licence is bought for the Instructor's course (Seats are created, no Enrollment) | Team Admin | The Instructor (revenue; Students arrive later as Seats are claimed) | `app/routes/courses.$slug.purchase.tsx:375-379` (`createTeamPurchase` `:245-256`) | No | One Instructor. Occasional |
| I3 | A Student claims a Seat and gets an Enrollment on the Instructor's course | Student | The Instructor; also the Team Admin (T1) | `app/routes/redeem.$code.tsx:185-213` (`redeemCoupon` `:47-113`, Enrollment `:106-110`) | No | One Instructor. Bursts when a Team Admin shares the links |
| I4 | A Student asks a question: a top-level comment on a lesson of the Instructor's course. It joins the Unanswered Questions queue | Student | The Instructor; every Platform Admin (their queue spans all courses, `app/routes/instructor.questions.tsx:175-176`) | `app/routes/courses.$slug.lessons.$lessonId.tsx:898-910`; queue query `app/routes/instructor.questions.tsx:42-97` | No | One Instructor plus every Platform Admin. Unbounded |
| I5 | A Student replies in a thread on the Instructor's course, including a follow-up to the Instructor's own answer | Student | The Instructor (as thread participant or course owner) | same as S2 | No | One Instructor. Many per thread |
| I6 | A Platform Admin answers a question on the Instructor's course, which removes it from the Instructor's queue; or a Platform Admin comments on a lesson | Platform Admin | The Instructor | `app/routes/instructor.questions.tsx:206-216` (`requireStaff` lets a Platform Admin answer on any course); lesson page as S2 | No | One Instructor. Occasional |
| I7 | A Student rates the Instructor's course, or changes their rating (1–5 stars, one per Student per course) | Student with an Enrollment | The Instructor | `app/routes/courses.$slug.tsx:453-481` (`rateCourse` `:330-362`) | No | One Instructor. A Student can change it any number of times |
| I8 | A Student completes a lesson (weak) | Student | The Instructor (roster progress, analytics) | `app/routes/courses.$slug.lessons.$lessonId.tsx:947-950` (`markLessonComplete` `:218-243`) | No | One Instructor. Very frequent: Students × lessons |
| I9 | A Student submits a quiz attempt, passed or failed (pass is a score above 0.7) | Student | The Instructor (analytics show failing quizzes) | `app/routes/courses.$slug.lessons.$lessonId.tsx:952-976` (attempt `:603`, pass rule `:599`) | No | One Instructor. Frequent; a Student may retry repeatedly |
| I10 | A Student's Enrollment on the Instructor's course ends because their Refund Request was approved; they show as Lapsed on the roster and the revenue is reversed | Platform Admin | The Instructor; also the Student (S6) | `app/lib/refunds.server.ts:658-665`; Lapsed is `app/lib/enrollments.ts:2` | Only to the buyer | One Instructor. Low |
| I11 | A Refund Request is raised on a Purchase of the Instructor's course (weak: the Instructor has no say over it) | Student or Team Admin | The Instructor | `app/routes/courses.$slug.refund.ts:63-69` | Only to the buyer | One Instructor. Low |
| I12 | The Instructor's course is published, unpublished or archived by someone else | Platform Admin | The Instructor; enrolled Students (S8) | `app/routes/admin.courses.tsx:141-144` | No | One Instructor. Rare |
| I13 | The Instructor's course is edited by someone else: details, price, modules, lessons, lesson content, quizzes | Platform Admin (allowed at `app/routes/instructor.$courseId.tsx:669`, and in the lesson and quiz editors) | The Instructor | every intent in `app/routes/instructor.$courseId.tsx:685-844`; `app/routes/instructor.$courseId.lessons.$lessonId.tsx:207`; `app/routes/instructor.$courseId.lessons.$lessonId.quiz.tsx:386`, `:425` | No | One Instructor. A burst of edits in one sitting |
| I14 | A comment on the Instructor's course is deleted by a Platform Admin, or edited or deleted by its author (weak) | Platform Admin; or the comment's author | The Instructor; for a deleted question, anyone who had replied | `app/routes/courses.$slug.lessons.$lessonId.tsx:912-936` | No | One Instructor. Low |
| I15 | A Student's question has waited three days and is marked stale. **Not a stored event**: it is worked out when the queue page renders; there is no scheduled job in the app | Passage of time | The Instructor; every Platform Admin | `app/routes/instructor.questions.tsx:160`, `:232-233` | No | One per question, but nothing fires it |
| I16 | A Student plays a video on the Instructor's course (weak; this is the raw data behind Watched) | Student | The Instructor (analytics); Platform Admins reviewing a Refund Request see the Watched figure live | `app/routes/api.video-tracking.ts:15-41` | No | Extremely frequent: several events per Student per lesson |

### Affects a Platform Admin

| # | What happened | Caused by | Affected | Where | Email today | Fan-out / frequency |
| --- | --- | --- | --- | --- | --- | --- |
| P1 | A Refund Request is raised on an Individual Purchase and joins the review queue | Student (the buyer) | Every Platform Admin; any one of them may decide it | `app/routes/courses.$slug.refund.ts:32-78`, `app/lib/refunds.server.ts:357-409` (insert `:379-388`) | **Yes**, but only the confirmation to the buyer. Nothing to Platform Admins | Every Platform Admin (the seed has one). At most one Open Refund Request per Purchase, but no cap across Purchases |
| P2 | A Refund Request is raised on a Team Licence (same action; its Unclaimed Seats go on hold) | Team Admin (the buyer) | Every Platform Admin | same as P1; hold `app/lib/refunds.server.ts:111-121` | **Yes**, confirmation to the buyer only | Every Platform Admin. Low |
| P3 | A Refund Request another Platform Admin was looking at has been decided. The first decision wins; the second gets a 409 "already approved/declined" | Another Platform Admin | Every other Platform Admin | `app/lib/refunds.server.ts:587-595` | No (the buyer is emailed, S6/S7/T2/T3) | Every other Platform Admin. Once per Refund Request |
| P4 | A Seat is claimed on a Team Licence. From then on a Refund Request on it can only be declined (ADR 0003). Claims are blocked while a request is Open, so this happens only before one is raised (weak) | Student | Platform Admins (it shapes a later decision); see T1 for the Team Admin | `app/routes/redeem.$code.tsx:98-104`; approval refused at `app/lib/refunds.server.ts:629-636` | No | Low |
| P5 | A new Student signs up (weak) | Student | Every Platform Admin (Manage Users list) | `app/routes/signup.tsx:78-79` | No | Every Platform Admin. Unbounded |
| P6 | An Instructor creates a course (it starts as Draft) (weak) | Instructor | Every Platform Admin (Manage Courses list) | `app/routes/instructor.new.tsx:112-160` (`createCourse` called `:149`, Draft `:68`) | No | Every Platform Admin. Low |
| P7 | An Instructor publishes, unpublishes or archives their course (weak) | Instructor | Every Platform Admin; enrolled Students (S8) | `app/routes/instructor.$courseId.tsx:695` | No | Every Platform Admin. Low |
| P8 | A category is created, renamed or deleted (weak). Deleting is refused while any course uses it | Platform Admin | Other Platform Admins; Instructors, who pick a category for a course | `app/routes/admin.categories.tsx:191`, `:203`, `:215` (`deleteCategory` `:117-135`) | No | Low |

### Affects a Team Admin

| # | What happened | Caused by | Affected | Where | Email today | Fan-out / frequency |
| --- | --- | --- | --- | --- | --- | --- |
| T1 | A Student claims a Seat on the Team Admin's Team Licence. It becomes a Claimed Seat and the licence can no longer be refunded | Student | The Team Admin who bought the licence; also the Instructor (I3) | `app/routes/redeem.$code.tsx:185-213` (Seat marked `:98-104`) | No | One Team Admin. Up to one per Seat; there is no upper limit on Seats (`quantity` is `min(1)`, `app/routes/courses.$slug.purchase.tsx:266`), and claims cluster after the links are shared |
| T2 | The Team Admin's Refund Request on a Team Licence is approved. Every Unclaimed Seat is marked refunded and can never be claimed | Platform Admin | The Team Admin; Students holding those Seat links (S19) | `app/lib/refunds.server.ts:628-643`, decision `:669-678` | **Yes**, to the buyer | One Team Admin. Once per Team Licence |
| T3 | The Team Admin's Refund Request on a Team Licence is declined, with a note. The Seats come off hold | Platform Admin | The Team Admin; Students holding Seat links (S19) | `app/lib/refunds.server.ts:692-733` | **Yes**, to the buyer | One Team Admin. Can repeat |
| T4 | The last Unclaimed Seat on a Team Licence is claimed (weak; a special case of T1 that the code does not single out) | Student | The Team Admin | same as T1; the count is derived on the team page | No | Once per Team Licence |

## Things that look like events but are not, today

- **A Refund being Issued or Failed.** The glossary defines Pending, Issued and Failed Refunds. The code has no Refund separate from the Refund Request, no payment processor, and no status beyond `open`, `approved`, `declined` (`app/db/schema.ts:34-38`). Nothing happens after approval.
- **A Student completing a course.** `enrollments.completed_at` exists and is read by the dashboard and rosters, but no route writes it.
- **A Student joining a team.** Claiming a Seat does not add a `team_members` row; `TeamMemberRole.Member` is never written. Only the Team Admin's own membership is created (`app/routes/courses.$slug.purchase.tsx:210-220`).
- **A failed Seat claim** (wrong country, on hold, already claimed) changes nothing and is recorded nowhere (`app/routes/redeem.$code.tsx:52-96`).
- **Anything time-based** (Refund Window closing, a question going stale). There is no scheduler; these are computed when a page loads.
- **Actions that touch only the actor**: editing your own profile (`app/routes/settings.tsx:66-98`; an Instructor's name and bio do show on their course pages), the DevUI user and country switches (`app/routes/api.switch-user.ts`, `app/routes/api.set-dev-country.ts`), login and logout.

## Where the code and the glossary disagree

1. **The Refund lifecycle is missing.** Glossary: an Approved Refund Request leads to a Refund that is Pending, then Issued or Failed. Code: approval sets `amount_refunded` on the Refund Request row and stops (`app/lib/refunds.server.ts:669-678`). The approval email says the money "is on its way back to you" (`:760`) with nothing behind it. This is items 6–8 of issue #1 and is still open.
2. **Table and wording for the request.** The `refunds` table holds Refund Requests (`app/db/schema.ts:232-257`); the glossary says not to call the ask a Refund.
3. **Seat is still "coupon", claim is still "redeem".** The glossary lists Coupon and Code under _Avoid_. The table is `coupons` with `redeemed_by_user_id` (`app/db/schema.ts:280-300`), the route is `redeem/:code`, and the Student reads "Redeem Coupon", "Coupon not found", "Coupon has already been redeemed" (`app/routes/redeem.$code.tsx:54`, `:58`, `:94`, `:244`).
4. **Who can be a Team Admin.** Glossary: "A Student who buys and manages a Team Licence." Code: the purchase action checks only that someone is signed in (`app/routes/courses.$slug.purchase.tsx:341-380`), so an Instructor or Platform Admin can buy a Team Licence too.
5. **One role per person.** `users.role` holds a single value, so a person is a Student, an Instructor or a Platform Admin everywhere (issue #1, item 5, still open). Team Admin is the exception: it is a `team_members` row, so it sits on top of whichever role the person has.
6. **One Issued Refund per course** (issue #1, item 9) is not enforced. The code blocks a second request on the same Purchase once one is approved (`app/lib/refunds.server.ts:290-296`) but a Student can buy the course again and ask again.
7. **Watch Limit value.** Issue #1 quotes two hours; the code uses one hour (`REFUND_WATCH_LIMIT_SECONDS = 60 * 60`, `app/lib/refund-rules.ts:6`). The glossary's Watch Limit entry gives no figure.
8. **Smaller wording drift.** The confirmation email says "Our team reviews every refund request" (`app/lib/refunds.server.ts:403`) and several errors say "Only admins can…" (`app/routes/admin.users.tsx:107`, `app/routes/admin.courses.tsx:129`); the glossary avoids "the team" and "Admin" on its own.

Issue #1's items 1–4 (completion rule on submit, Refund amount equals amount paid, approval ends the Enrollment, a screen for a Platform Admin to decide) are implemented at `979e285`. They are not on `origin/main`.

## Facts that bear on grouping and fan-out

- **Platform Admins are a set, not one person.** Any event "for the Platform Admin" goes to every person with `role = "admin"`. The seed creates one.
- **An Instructor is one person per course** (`courses.instructor_id`), but a Platform Admin can do everything an Instructor can on any course, including answering questions.
- **Enrolled Students are the large audience.** S8–S14 each reach every Student with an Enrollment on a course, and the editor actions behind S9–S13 fire once per small edit.
- **Comment threads are one level deep** (`app/db/schema.ts:339-341`), so "replies to one comment" is a flat list under one parent.
- **A Refund Request has at most one Open instance per Purchase** (`app/lib/refunds.server.ts:282-288`) and is decided exactly once (`:587-595`).
