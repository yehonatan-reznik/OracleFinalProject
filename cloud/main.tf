# ==============================================================================
# 1. IAM (Groups & Policies)
# ==============================================================================

resource "oci_identity_group" "pos_admins" {
  name           = "POS-Admins"
  description    = "Full management access to all resources in the project Compartment."
  compartment_id = var.tenancy_id
}

resource "oci_identity_group" "pos_developers" {
  name           = "POS-Developers"
  description    = "Access to manage Compute Instances (VMs) and view DB configuration."
  compartment_id = var.tenancy_id
}

resource "oci_identity_group" "pos_auditors" {
  name           = "POS-Auditors"
  description    = "Read-only access to the Autonomous Database."
  compartment_id = var.tenancy_id
}

resource "oci_identity_dynamic_group" "pos_backend_vm" {
  name           = "POS-Backend-VM"
  description    = "Identifies the Backend Node.js VM instance"
  compartment_id = var.tenancy_id
  matching_rule  = "ALL {instance.compartment.id = '${var.compartment_id}'}"
}

resource "oci_identity_policy" "pos_project_policies" {
  name           = "POS-Project-Policies"
  description    = "Policies for the Oracle Final Project"
  compartment_id = var.compartment_id

  statements = [
    "Allow group POS-Admins to manage all-resources in compartment FinalProject",
    "Allow group POS-Developers to use instance-family in compartment FinalProject",
    "Allow group POS-Auditors to read autonomous-database-family in compartment FinalProject",
    "Allow dynamic-group POS-Backend-VM to read secret-family in compartment FinalProject",
    "Allow dynamic-group POS-Backend-VM to manage objects in compartment FinalProject"
  ]
}

# ==============================================================================
# 2. Networking
# ==============================================================================

resource "oci_core_vcn" "main_vcn" {
  compartment_id = var.compartment_id
  display_name   = "FinalProjectVCN"
  cidr_block     = "10.0.0.0/16"
  dns_label      = "finalproject"
}

resource "oci_core_internet_gateway" "ig" {
  compartment_id = var.compartment_id
  vcn_id         = oci_core_vcn.main_vcn.id
  display_name   = "InternetGateway"
  enabled        = true
}

resource "oci_core_route_table" "public_rt" {
  compartment_id = var.compartment_id
  vcn_id         = oci_core_vcn.main_vcn.id
  display_name   = "PublicRouteTable"

  route_rules {
    destination       = "0.0.0.0/0"
    network_entity_id = oci_core_internet_gateway.ig.id
  }
}

resource "oci_core_security_list" "public_sl" {
  compartment_id = var.compartment_id
  vcn_id         = oci_core_vcn.main_vcn.id
  display_name   = "PublicSecurityList"

  egress_security_rules {
    protocol    = "all"
    destination = "0.0.0.0/0"
  }

  ingress_security_rules { # SSH
    protocol = "6"
    source   = "0.0.0.0/0"
    tcp_options { min = 22; max = 22; }
  }
  ingress_security_rules { # HTTP
    protocol = "6"
    source   = "0.0.0.0/0"
    tcp_options { min = 80; max = 80; }
  }
  ingress_security_rules { # HTTPS
    protocol = "6"
    source   = "0.0.0.0/0"
    tcp_options { min = 443; max = 443; }
  }
}

resource "oci_core_subnet" "public_subnet" {
  compartment_id    = var.compartment_id
  vcn_id            = oci_core_vcn.main_vcn.id
  display_name      = "PublicSubnet"
  cidr_block        = "10.0.1.0/24"
  route_table_id    = oci_core_route_table.public_rt.id
  security_list_ids = [oci_core_security_list.public_sl.id]
  dns_label         = "public"
}

# ==============================================================================
# 3. Compute
# ==============================================================================

resource "oci_core_instance" "backend_vm" {
  compartment_id      = var.compartment_id
  availability_domain = "TvDn:US-ASHBURN-AD-1"
  shape               = "VM.Standard.E2.1.Micro"
  display_name        = "Backend-VM"

  create_vnic_details {
    subnet_id        = oci_core_subnet.public_subnet.id
    assign_public_ip = true
  }

  source_details {
    source_type = "image"
    source_id   = "ocid1.image.oc1.iad.example"
  }

  metadata = {
    ssh_authorized_keys = "ssh-rsa AAAAB3..."
  }
}

# ==============================================================================
# 4. Storage (Bucket)
# ==============================================================================

resource "oci_objectstorage_bucket" "frontend_bucket" {
  compartment_id = var.compartment_id
  name           = "oracle-final-project-frontend"
  namespace      = "example_namespace"
  access_type    = "ObjectRead"
  storage_tier   = "Standard"
  versioning     = "Disabled"

  metadata = {
    "project" = "OracleFinalProject"
    "content" = "HTML, JS, CSS"
  }
}

# ==============================================================================
# 5. Security (Vault & Secrets)
# ==============================================================================

resource "oci_kms_vault" "main_vault" {
  compartment_id = var.compartment_id
  display_name   = "FinalProjectVault"
  vault_type     = "DEFAULT"
}

resource "oci_kms_key" "master_key" {
  compartment_id = var.compartment_id
  display_name   = "MasterEncryptionKey"
  management_endpoint = oci_kms_vault.main_vault.management_endpoint

  key_shape {
    algorithm = "AES"
    length    = 32 # AES-256
  }
}

resource "oci_vault_secret" "db_password" {
  compartment_id = var.compartment_id
  vault_id       = oci_kms_vault.main_vault.id
  key_id         = oci_kms_key.master_key.id
  secret_name    = "DB_PASSWORD"
  secret_content {
    content_type = "BASE64"
    content      = "U2VjcmV0UEBzc3dvcmQxMjM=" # "SecretP@ssword123" base64 encoded
  }
}
