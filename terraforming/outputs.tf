output "instance_public_ip" {
  description = "Public IP address of the VM."
  value       = oci_core_instance.app.public_ip
}

output "instance_id" {
  description = "OCID of the compute instance."
  value       = oci_core_instance.app.id
}

output "bucket_name" {
  description = "Name of the private JSON bucket."
  value       = oci_objectstorage_bucket.json_store.name
}

output "subnet_id" {
  description = "OCID of the public subnet."
  value       = oci_core_subnet.public.id
}

output "vcn_id" {
  description = "OCID of the VCN."
  value       = oci_core_vcn.main.id
}
