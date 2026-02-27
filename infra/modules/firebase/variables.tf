variable "project_id" {
  description = "The GCP project ID"
  type        = string
}

variable "project_name" {
  description = "The GCP project name"
  type        = string
}

variable "web_app_name" {
  description = "The Firebase web app display name"
  type        = string
}

variable "firestore_database_name" {
  description = "The Firestore database name"
  type        = string
  default     = "(default)"
}

variable "region" {
  description = "The GCP region"
  type        = string
}

variable "firestore_type" {
  description = "The Firestore database type"
  type        = string
  default     = "FIRESTORE_NATIVE"
}

variable "google_oauth_client_id" {
  description = "Google OAuth 2.0 Client ID"
  type        = string
  sensitive   = true
}

variable "google_oauth_client_secret" {
  description = "Google OAuth 2.0 Client Secret"
  type        = string
  sensitive   = true
}

variable "preview_authorized_domains" {
  description = "Preview domains to be added into Firebase authorized domains"
  type        = list(string)
  default     = []
}
