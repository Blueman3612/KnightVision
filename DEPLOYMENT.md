# Chess Tutor Application Deployment Guide

This document provides instructions for deploying the Chess Tutor application, which consists of:
1. A FastAPI backend deployed on AWS EC2
2. A Next.js frontend deployed on AWS Amplify

## Backend Deployment (EC2)

The backend is containerized using Docker and deployed on an AWS EC2 instance.

### Prerequisites
- AWS Account
- EC2 instance with Docker installed
- Security group with port 8000 open for API access

### Deployment Steps
1. SSH into your EC2 instance:
   ```
   ssh -i your-key.pem ec2-user@your-ec2-ip
   ```

2. Install Docker if not already installed:
   ```
   sudo yum update -y
   sudo amazon-linux-extras install docker
   sudo service docker start
   sudo usermod -a -G docker ec2-user
   ```

3. Clone the repository:
   ```
   git clone https://github.com/yourusername/chess-tutor.git
   cd chess-tutor
   ```

4. Build and run the Docker container:
   ```
   cd backend
   docker build -t chess-tutor-backend .
   docker run -d -p 8000:8000 chess-tutor-backend
   ```

5. Verify the API is running:
   ```
   curl http://localhost:8000/docs
   ```

## Frontend Deployment (AWS Amplify)

The frontend is deployed using AWS Amplify, which integrates with your Git repository for continuous deployment.

### Prerequisites
- AWS Account
- GitHub repository with your Chess Tutor project
- Amplify CLI (optional, for local testing)

### Deployment Steps

1. **Create a new Amplify app:**
   - Log in to the AWS Management Console
   - Navigate to AWS Amplify
   - Click "New app" → "Host web app"
   - Connect to your GitHub repository
   - Select the branch to deploy

2. **Configure build settings:**
   - Ensure the amplify.yml file is in your repository root
   - Alternatively, use the following build settings in the Amplify console:
     - Build command: `cd frontend && npm ci && npm run build`
     - Output directory: `frontend/.next`

3. **Environment variables (if needed):**
   - Add the backend API URL to environment variables:
     - NEXT_PUBLIC_API_URL: `http://your-ec2-ip:8000`

4. **Save and deploy:**
   - Click "Save and deploy"
   - Amplify will clone your repository, build the frontend, and deploy it

5. **Access your deployed frontend:**
   - Once deployment is complete, click on the generated domain URL
   - Your Chess Tutor application should now be accessible

## Troubleshooting TypeScript Errors

If you encounter TypeScript errors during deployment, follow these steps:

1. **Check React component definitions:**
   - Use proper function declarations without React.FC:
   ```typescript
   function ComponentName(props: PropsType) {
     // Component code
   }
   ```

2. **Fix useRef typing:**
   - When using refs that start as null:
   ```typescript
   const myRef = useRef<HTMLElement | null>(null);
   ```

3. **Handle null checks properly:**
   - Always check if refs are null before accessing them:
   ```typescript
   if (myRef.current) {
     // Safe to use myRef.current here
   }
   ```

## Maintenance

### Backend Updates
1. SSH into your EC2 instance
2. Pull the latest code: `git pull`
3. Rebuild and restart the Docker container:
   ```
   docker stop <container-id>
   docker build -t chess-tutor-backend .
   docker run -d -p 8000:8000 chess-tutor-backend
   ```

### Frontend Updates
1. Push your changes to the connected GitHub repository
2. Amplify will automatically detect changes and redeploy

## Monitoring

- Monitor your EC2 instance using AWS CloudWatch
- View Amplify deployment logs in the Amplify Console
- Set up alerts for high resource usage or errors 