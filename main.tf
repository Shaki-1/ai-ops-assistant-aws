resource "aws_instance" "ai_ops_assistant" {
  ami           = var.ami_id
  instance_type = var.ec2_type
  subnet_id     = var.subnet_id
  key_name      = var.keypair

  vpc_security_group_ids = [var.main_sg_id]

  user_data = templatefile("user-data.web.sh", {
    groq_api_key        = var.groq_api_key
    duckdns_domain      = var.duckdns_domain
    duckdns_token       = var.duckdns_token
    admin_username      = var.admin_username
    admin_password_hash = var.admin_password_hash
    auth_token_secret   = var.auth_token_secret
  })

  user_data_replace_on_change = true

  tags = {
    Name  = var.ec2_name
    Owner = var.aws_owner
  }
}
