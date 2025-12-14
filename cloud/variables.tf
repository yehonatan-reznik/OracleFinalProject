variable "tenancy_id" {
  description = "OCID of the tenancy"
  type        = string
}

variable "user_id" {
  description = "OCID of the user calling the API"
  type        = string
}

variable "fingerprint" {
  description = "Fingerprint for the API private key"
  type        = string
}

variable "private_key_path" {
  description = "Path to the API private key"
  type        = string
}

variable "region" {
  description = "OCI Region (e.g., us-ashburn-1)"
  type        = string
}

variable "compartment_id" {
  description = "OCID of the compartment containing project resources"
  type        = string
}
