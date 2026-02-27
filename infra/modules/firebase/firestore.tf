resource "google_firestore_database" "this" {
  provider    = google-beta
  project     = google_project.this.project_id
  name        = var.firestore_database_name
  location_id = var.region
  type        = var.firestore_type

  depends_on = [google_project_service.firestore]
}
