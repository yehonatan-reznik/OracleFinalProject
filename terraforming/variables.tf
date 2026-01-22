variable "tenancy_ocid" {
  description = "OCI tenancy OCID (also used as compartment for Always Free)."
  type        = string
}

variable "user_ocid" {
  description = "OCI user OCID."
  type        = string
}

variable "fingerprint" {
  description = "API key fingerprint."
  type        = string
}

variable "private_key_path" {
  description = "Path to API private key file."
  type        = string
}

variable "region" {
  description = "OCI region identifier, e.g. us-ashburn-1."
  type        = string
}

variable "ssh_public_key" {
  description = "SSH public key for the compute instance."
  type        = string
}
