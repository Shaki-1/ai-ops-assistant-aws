variable "ec2_name" {
  type = string
}

variable "ec2_type" {
  type = string
}

variable "keypair" {
  type = string
}

variable "ami_id" {
  type = string
}

variable "subnet_id" {
  type = string
}

variable "main_sg_id" {
  type = string
}

variable "aws_owner" {
  type = string
}

variable "groq_api_key" {
  type      = string
  sensitive = true
}

variable "duckdns_domain" {
  type    = string
  default = "shaki-aiops"
}

variable "duckdns_token" {
  type      = string
  sensitive = true
}
