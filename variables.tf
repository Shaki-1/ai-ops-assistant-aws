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

variable "admin_username" {
  type = string
}

variable "admin_password" {
  type      = string
  sensitive = true
}

variable "user_username" {
  type    = string
  default = "user"
}

variable "user_password" {
  type      = string
  sensitive = true
}

variable "auth_token_secret" {
  type      = string
  sensitive = true
}
