terraform {
  required_version = ">= 1.10.0"

  backend "remote" {
    organization = "lnwu"

    workspaces {
      name = "learning-english-infra"
    }
  }

  required_providers {
    google = {
      source  = "hashicorp/google"
      version = "~> 7.0"
    }
    google-beta = {
      source  = "hashicorp/google-beta"
      version = "~> 7.0"
    }
  }
}

locals {
  project_id   = "learning-english-477407"
  project_name = "learning-english"
  region       = "asia-east2"
  web_app_name = "Learning English Web"
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

provider "google" {
  project               = local.project_id
  region                = local.region
  billing_project       = local.project_id
  user_project_override = true
}

provider "google-beta" {
  project               = local.project_id
  region                = local.region
  billing_project       = local.project_id
  user_project_override = true
}

module "firebase" {
  source = "./modules/firebase"

  region       = local.region
  project_id   = local.project_id
  project_name = local.project_name
  web_app_name = local.web_app_name

  google_oauth_client_id     = var.google_oauth_client_id
  google_oauth_client_secret = var.google_oauth_client_secret
  preview_authorized_domains = var.preview_authorized_domains
}
