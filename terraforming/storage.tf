data "oci_objectstorage_namespace" "ns" {
}

resource "oci_objectstorage_bucket" "json_store" {
  compartment_id = var.tenancy_ocid
  name           = "${local.name_prefix}-json"
  namespace      = data.oci_objectstorage_namespace.ns.namespace
  access_type    = "NoPublicAccess"
  storage_tier   = "Standard"

  # Object Storage is Always Free and replaces a paid database for JSON persistence.
}
