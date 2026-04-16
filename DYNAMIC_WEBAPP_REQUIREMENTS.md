# Smart Campus Support System — Dynamic Web App Checklist

This project is a fully dynamic web application with an AngularJS UI, a REST API backend, and MongoDB database integration.

## Tech stack

- **Frontend**: AngularJS (single-page app) in `frontend/` (`index.html`, `app.js`, `styles.css`)
- **Backend**: Node.js + Express in `backend/`
- **Database**: MongoDB via Mongoose models
- **Auth**: JWT (Bearer token) + role field in `User`

## RESTful API + database integration

The backend exposes multiple REST endpoints under `/api/*`, backed by Mongoose models:

- **Auth**: `/api/auth/*` (signup/login/me)
- **Lost items**: `/api/lost-items/*`
- **Found items**: `/api/found-items/*`
- **Claims**: `/api/claims/*`
- **Complaints**: `/api/complaints/*` (+ supports + importance)

This is **more than five** API endpoints and all modules are persisted in MongoDB.

## CRUD coverage (create/read/update/delete)

- **Complaints**
  - Create: `POST /api/complaints`
  - Read: `GET /api/complaints`, `GET /api/complaints/:id`
  - Update: `PUT /api/complaints/:id`
  - Delete: `DELETE /api/complaints/:id`
  - Extra: supports `POST/DELETE /api/complaints/:id/support`, admin importance `PUT /api/complaints/:id/importance`

- **Lost items**
  - Create: `POST /api/lost-items`
  - Read: `GET /api/lost-items`, `GET /api/lost-items/:id`
  - Update (edit/close): `PUT /api/lost-items/:id`
  - Delete: `DELETE /api/lost-items/:id` (UI uses close instead to keep records)

- **Found items**
  - Create: `POST /api/found-items`
  - Read: `GET /api/found-items`, `GET /api/found-items/:id`
  - Update (edit/close): `PUT /api/found-items/:id`
  - Delete: `DELETE /api/found-items/:id` (UI uses close instead to keep records)

- **Claims**
  - Create: `POST /api/claims`
  - Read: `GET /api/claims`, `GET /api/claims/:id`
  - Update: `PUT /api/claims/:id`
  - Delete: `DELETE /api/claims/:id`

## Error handling

- The backend uses centralized error utilities in `backend/src/utils/ApiError` and middleware in `backend/src/middleware/errorHandlers.js`.
- All controllers validate inputs and return meaningful HTTP error codes (400/401/403/404).

## Role-based + ownership rules (important)

- Only the **creator** can edit/close/delete their own lost items, found items, and complaints.
- Users cannot claim their own lost/found posts (**self-claim prevention**).
- Complaints can be supported by other users (one support per user).
- Only **admin** can set complaint importance.

