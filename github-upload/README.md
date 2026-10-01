# NailsByDav Studio

Standalone salon and academy website with a Node.js backend.

## Run locally

Install Node.js 20 or newer, then from this folder run:

```bash
npm start
```

Open http://localhost:3000.

## Student payments

Student signup creates a pending account and redirects to Paystack Checkout. The
Student Area and all course progress endpoints remain locked until Paystack sends
the signed successful-payment webhook.

Configure these environment variables before accepting payments:

```text
PAYSTACK_SECRET_KEY=sk_test_your-secret-key
PAYSTACK_CURRENCY=NGN
PUBLIC_BASE_URL=https://your-domain.example
```

Use your Paystack test secret key while testing. Create a webhook endpoint at
`/api/paystack/webhook` in Paystack. Paystack signs webhook requests with your
secret key; the server verifies that signature before granting access.
`PUBLIC_BASE_URL` must be a public HTTPS URL for the payment callback.

## Backend routes

- `GET /api/courses` - academy course catalog
- `GET /api/courses/:courseId` - public course details by ID or slug; lesson content and private materials are not returned
- `GET /api/services` - salon service catalog
- `POST /api/bookings` - saves appointment requests to `data/bookings.json`
- `POST /api/student/courses/:courseId/complete` - records the next course lesson for a logged-in, paid student

Academy course records live in `data/courses.json`. Existing student enrollments keep their course IDs (`beginner`, `masterclass`, `advanced`, and `professional`); student accounts and numeric course progress remain in `data/students.json`. The public catalog and course detail page use the shared course records, while full lesson records and materials are included only in authenticated paid-student responses.

Booking payload fields: `name`, `email`, `service`, and `date`. The optional `message` field is also preserved.
