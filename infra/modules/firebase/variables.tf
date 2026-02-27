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
