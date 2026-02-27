resource "google_project" "this" {
  project_id = var.project_id
  name       = var.project_name
}

resource "google_project_service" "firebase" {
  project = google_project.this.project_id
  service = "firebase.googleapis.com"
}

resource "google_project_service" "firestore" {
  project    = google_project.this.project_id
  service    = "firestore.googleapis.com"
  depends_on = [google_project_service.firebase]
}

resource "google_project_service" "firebaserules" {
  project    = google_project.this.project_id
  service    = "firebaserules.googleapis.com"
  depends_on = [google_project_service.firebase]
}

resource "google_project_service" "iamcredentials" {
  project    = google_project.this.project_id
  service    = "iamcredentials.googleapis.com"
  depends_on = [google_project_service.firebase]
}

resource "google_firebase_project" "this" {
  provider = google-beta
  project  = google_project.this.project_id

  depends_on = [google_project_service.firebase]
}

resource "google_firebase_web_app" "this" {
  provider     = google-beta
  project      = google_project.this.project_id
  display_name = var.web_app_name

  depends_on = [google_firebase_project.this]
}
