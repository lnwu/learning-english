output "project_id" {
  description = "The GCP project ID"
  value       = google_project.this.project_id
}

output "firebase_web_app_id" {
  description = "The Firebase web app ID"
  value       = google_firebase_web_app.this.app_id
}

output "firestore_database_name" {
  description = "The Firestore database name"
  value       = google_firestore_database.this.name
}

output "firestore_database_location" {
  description = "The Firestore database location"
  value       = google_firestore_database.this.location_id
}
