# Google Cloud Provider Configuration
provider "google" {
  project = var.project_id
  region  = var.region
}

# Variable Definitions
variable "project_id" {
  description = "The ID of the project in which to create resources."
  type        = string
}

variable "region" {
  description = "The region in which to create resources."
  type        = string
  default     = "us-central1" # Free tier eligible: us-west1, us-central1, us-east1
}

variable "zone" {
  description = "The zone in which to create resources."
  type        = string
  default     = "us-central1-a"
}

# Network Configuration
resource "google_compute_network" "vpc_network" {
  name = "simpleclaw-network"
}

resource "google_compute_firewall" "default" {
  name    = "allow-http-https"
  network = google_compute_network.vpc_network.name

  allow {
    protocol = "tcp"
    ports    = ["80", "443", "3000", "22"]
  }

  source_ranges = ["0.0.0.0/0"]
}

# Compute Instance (E2-Micro is Free Tier eligible)
resource "google_compute_instance" "vm_instance" {
  name         = "simpleclaw-app"
  machine_type = "e2-micro" # 2 vCPU, 1GB RAM (Free Tier)
  zone         = var.zone

  boot_disk {
    initialize_params {
      image = "ubuntu-os-cloud/ubuntu-2204-lts"
      size  = 30 # 30GB is the Free Tier limit
      type  = "pd-standard"
    }
  }

  network_interface {
    network = google_compute_network.vpc_network.name
    access_config {
      # Ephemeral IP
    }
  }

  metadata_startup_script = <<-EOF
    #!/bin/bash
    sudo apt-get update
    sudo apt-get install -y docker.io docker-compose
    sudo systemctl start docker
    sudo systemctl enable docker
    # Setup SWAP (Crucial for e2-micro with only 1GB RAM)
    sudo fallocate -l 2G /swapfile
    sudo chmod 600 /swapfile
    sudo mkswap /swapfile
    sudo swapon /swapfile
    echo '/swapfile none swap sw 0 0' | sudo tee -a /etc/fstab
  EOF

  tags = ["http-server", "https-server"]
}

output "instance_ip" {
  value = google_compute_instance.vm_instance.network_interface[0].access_config[0].nat_ip
}
