output "vm_public_ip" {
  value = oci_core_instance.backend_vm.public_ip
}

output "vm_state" {
  value = oci_core_instance.backend_vm.state
}

output "bucket_name" {
  value = oci_objectstorage_bucket.frontend_bucket.name
}

output "bucket_access_type" {
  value = oci_objectstorage_bucket.frontend_bucket.access_type
}

output "vault_management_endpoint" {
  value = oci_kms_vault.main_vault.management_endpoint
}
