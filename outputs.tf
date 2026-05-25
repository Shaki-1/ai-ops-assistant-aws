output "ec2_public_dns_name" {
  value = aws_instance.ai_ops_assistant.public_dns
}

output "ec2_public_ip" {
  value = aws_instance.ai_ops_assistant.public_ip
}
