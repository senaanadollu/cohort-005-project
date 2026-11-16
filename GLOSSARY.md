# Cadence

The shared language for Cadence, the platform where students buy and take courses. Use these terms in the UI, in emails, in code and in conversation.

## Language

### People

Student and Instructor are roles a person plays in a particular Course, not kinds of person: the same person can be the Instructor of one Course and a Student in another.

**Student**:
A person who has an Enrollment in a Course.
_Avoid_: Learner, User, Customer, Member

**Instructor**:
The person who creates and teaches a Course. Every Course has exactly one Instructor.
_Avoid_: Teacher, Author, Creator, Tutor, Educator

**Admin**:
A Cadence staff member, and the only person who can approve or decline a Refund Request.
_Avoid_: Staff, Support, "the team"

### Buying a course

**Course**:
A piece of teaching on Cadence, made up of modules and lessons, that can be bought.
_Avoid_: Class, Program

**Purchase**:
A one-off payment made by a Student or a Team for a Course.
_Avoid_: Order, Membership, Subscription, Transaction

**Enrollment**:
A Student having access to a Course, whether through their own Purchase or a Claimed Seat.
_Avoid_: Access, Registration, Signup

**PPP Price**:
A Course price lowered according to the Student's country.
_Avoid_: Regional price, Discount price, Coupon

**Team**:
A group that buys a Course in bulk for its people.
_Avoid_: Company, Organisation, Group

**Team Seat**:
One person's share of a Team's Purchase, which can be handed to a Student.
_Avoid_: Coupon, Licence, Code

**Claimed Seat**:
A Team Seat a Student has started using.
_Avoid_: Redeemed coupon, Used licence

### Refunds

**Refund Request**:
A Student's request to get back the money they paid for a whole Purchase, which an Admin either approves or declines. If it is approved, the Student loses their Enrollment in that Course at that moment, even if the Refund later fails.
_Avoid_: Cancellation, Cancel my purchase, Reversal, Chargeback, Pending Chargeback, Claim, Dispute

**Refund**:
The sending of the Refund Amount back to the Student, created when their Refund Request is approved. A declined Refund Request creates no Refund.
_Avoid_: Cancellation, Reversal, Chargeback, Return, Withdrawal, Money-back, Reimbursement

**Refund Reason**:
The Student's own words explaining why they are making a Refund Request.
_Avoid_: Note, Comment, Complaint

**Refund Window**:
The 14 calendar days after the day of a Purchase, during which a Refund Request can be made; the day of the Purchase itself also counts.
_Avoid_: Cancellation period, Grace period, Money-back period

**Refund Eligibility**:
Whether a Purchase can have a Refund Request made on it, judged at the moment the request is made: it is inside the Refund Window, the Student has watched less than two hours and completed less than half of the Course, none of its Team Seats has been claimed, and the Student has never had an Issued Refund for that Course before. Nothing that happens while the Refund Request is Pending changes it.
_Avoid_: Cancellation rules

**Refund Amount**:
The amount the Student paid for the Purchase, given back in full by a Refund.
_Avoid_: Reversal amount

### Refund Request statuses

A Refund Request only ever moves from Pending to Approved or Declined, and stays there.

**Pending** (Refund Request):
A Refund Request an Admin has not yet approved or declined.
_Avoid_: Requested, Under review, In progress, Open

**Approved**:
A Refund Request an Admin has accepted. It creates a Refund and stays Approved whatever then happens to that Refund.
_Avoid_: Accepted, Granted, Completed

**Declined**:
A Refund Request an Admin has turned down; no money is given back and the Student keeps their Enrollment. The Student can make a new Refund Request while the Purchase still has Refund Eligibility.
_Avoid_: Rejected, Denied, Refused

### Refund statuses

A Refund moves from Pending to Issued or Failed. These are the Refund's own statuses, separate from the Refund Request's. Because both have a Pending status, always say which one: a "Pending Refund Request" is waiting for an Admin, a "Pending Refund" is waiting for the payment processor. Never say "pending" on its own.

**Pending** (Refund):
A Refund that has been sent to the payment processor but not yet confirmed.
_Avoid_: Processing, In progress, Sent

**Issued**:
A Refund the payment processor has confirmed: the money has moved back to the Student.
_Avoid_: Refunded, Completed, Paid, Settled

**Failed**:
A Refund the payment processor could not complete; the money has not moved. A Failed Refund stays Failed: an Admin creates a new Refund for the same Approved Refund Request, so the Student never has to ask again. An Approved Refund Request has at most one Refund that is not Failed.
_Avoid_: Rejected, Bounced, Error
