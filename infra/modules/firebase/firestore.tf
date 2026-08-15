resource "google_firestore_database" "this" {
  provider                          = google-beta
  project                           = google_project.this.project_id
  name                              = var.firestore_database_name
  location_id                       = var.region
  type                              = var.firestore_type
  point_in_time_recovery_enablement = "POINT_IN_TIME_RECOVERY_ENABLED"
  delete_protection_state           = "DELETE_PROTECTION_ENABLED"

  depends_on = [google_project_service.firestore]

  lifecycle {
    prevent_destroy = true
  }
}
