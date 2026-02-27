resource "google_firebaserules_ruleset" "firestore" {
  provider = google-beta
  project  = google_project.this.project_id

  source {
    files {
      content = file("${path.module}/firestore.rules")
      name    = "firestore.rules"
    }
  }

  depends_on = [google_firestore_database.this, google_project_service.firebaserules]
}

resource "google_firebaserules_release" "firestore" {
  provider     = google-beta
  project      = google_project.this.project_id
  name         = "cloud.firestore"
  ruleset_name = google_firebaserules_ruleset.firestore.id

  lifecycle {
    replace_triggered_by = [google_firebaserules_ruleset.firestore]
  }
}
