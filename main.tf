resource "aws_instance" "ai_ops_assistant" {
  ami           = var.ami_id
  instance_type = var.ec2_type
  subnet_id     = var.subnet_id
  key_name      = var.keypair

  vpc_security_group_ids = [var.main_sg_id]

  user_data                   = file("user-data.web.sh")
  user_data_replace_on_change = true

  tags = {
    Name  = var.ec2_name
    Owner = var.aws_owner
  }
}
