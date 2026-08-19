resource "google_firestore_database" "this" {
  provider    = google-beta
  project     = google_project.this.project_id
  name        = var.firestore_database_name
  location_id = var.region
  type        = var.firestore_type

  delete_protection_state           = "DELETE_PROTECTION_DISABLED"
  point_in_time_recovery_enablement = "POINT_IN_TIME_RECOVERY_DISABLED"

  depends_on = [google_project_service.firestore]
}
