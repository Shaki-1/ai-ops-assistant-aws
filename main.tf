data "aws_ami" "amazon_linux_2023" {
  most_recent = true
  owners      = ["amazon"]

  filter {
    name   = "name"
    values = ["al2023-ami-*-x86_64"]
  }
}

data "aws_vpc" "default" {
  default = true
}

data "aws_subnets" "default" {
  filter {
    name   = "vpc-id"
    values = [data.aws_vpc.default.id]
  }
}

resource "aws_security_group" "ai_ops_assistant" {
  name        = "${var.ec2_name}-web-sg"
  description = "AI Ops Assistant web access"
  vpc_id      = data.aws_vpc.default.id

  tags = {
    Name  = "${var.ec2_name}-web-sg"
    Owner = var.aws_owner
  }
}

resource "aws_vpc_security_group_ingress_rule" "ssh" {
  security_group_id = aws_security_group.ai_ops_assistant.id
  description       = "SSH access"
  cidr_ipv4         = "0.0.0.0/0"
  ip_protocol       = "tcp"
  from_port         = 22
  to_port           = 22
}

resource "aws_vpc_security_group_ingress_rule" "http" {
  security_group_id = aws_security_group.ai_ops_assistant.id
  description       = "HTTP web access"
  cidr_ipv4         = "0.0.0.0/0"
  ip_protocol       = "tcp"
  from_port         = 80
  to_port           = 80
}

resource "aws_vpc_security_group_ingress_rule" "https" {
  security_group_id = aws_security_group.ai_ops_assistant.id
  description       = "HTTPS web access"
  cidr_ipv4         = "0.0.0.0/0"
  ip_protocol       = "tcp"
  from_port         = 443
  to_port           = 443
}

resource "aws_vpc_security_group_egress_rule" "all_outbound" {
  security_group_id = aws_security_group.ai_ops_assistant.id
  description       = "Allow all outbound traffic"
  cidr_ipv4         = "0.0.0.0/0"
  ip_protocol       = "-1"
}

resource "aws_instance" "ai_ops_assistant" {
  ami                         = data.aws_ami.amazon_linux_2023.id
  instance_type               = var.ec2_type
  subnet_id                   = data.aws_subnets.default.ids[0]
  key_name                    = var.keypair
  associate_public_ip_address = true

  vpc_security_group_ids = [aws_security_group.ai_ops_assistant.id]

  user_data = templatefile("user-data.web.sh", {
    groq_api_key      = var.groq_api_key
    duckdns_domain    = var.duckdns_domain
    duckdns_token     = var.duckdns_token
    admin_username    = var.admin_username
    admin_password    = var.admin_password
    user_username     = var.user_username
    user_password     = var.user_password
    auth_token_secret = var.auth_token_secret
  })

  user_data_replace_on_change = true

  tags = {
    Name  = var.ec2_name
    Owner = var.aws_owner
  }
}
