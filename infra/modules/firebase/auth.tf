resource "google_project_service" "identitytoolkit" {
  project    = google_project.this.project_id
  service    = "identitytoolkit.googleapis.com"
  depends_on = [google_project_service.firebase]
}

resource "google_identity_platform_config" "this" {
  provider = google-beta
  project  = google_project.this.project_id

  autodelete_anonymous_users = false

  multi_tenant {
    allow_tenants = false
  }

  sign_in {
    anonymous {
      enabled = false
    }

    email {
      enabled           = false
      password_required = false
    }

    phone_number {
      enabled            = false
      test_phone_numbers = {}
    }
  }

  authorized_domains = [
    "localhost",
    "${google_project.this.project_id}.firebaseapp.com",
    "${google_project.this.project_id}.web.app",
    "learning-english-web.vercel.app",
  ]

  depends_on = [
    google_firebase_project.this,
    google_project_service.identitytoolkit,
  ]
}

resource "google_identity_platform_default_supported_idp_config" "google" {
  provider = google-beta
  project  = google_project.this.project_id

  idp_id        = "google.com"
  client_id     = var.google_oauth_client_id
  client_secret = var.google_oauth_client_secret

  enabled = true

  depends_on = [google_identity_platform_config.this]
}
