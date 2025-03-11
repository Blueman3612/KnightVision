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
   - Your repository should have a structure with the Next.js application in a `frontend` directory
   - Alternatively, use the following build settings in the Amplify console:
     - Build command: 
       ```
       cd frontend && npm install && npm run build
       ```
     - Output directory: `frontend/.next`
   - **Important:** Make sure the output directory is relative to the repository root, not to where the build commands run

3. **Environment variables (if needed):**
   - Add the backend API URL to environment variables in the Amplify Console:
     - NEXT_PUBLIC_API_URL: `http://your-ec2-ip:8000` (use your actual EC2 public IP)
   - **Required Supabase variables:**
     - NEXT_PUBLIC_SUPABASE_URL: Your Supabase project URL (e.g., https://yourproject.supabase.co)
     - NEXT_PUBLIC_SUPABASE_ANON_KEY: Your Supabase project's anonymous/public API key
   - To find your Supabase credentials:
     1. Log in to your Supabase dashboard (https://app.supabase.com)
     2. Select your project
     3. Go to "Project Settings" > "API"
     4. Copy the URL and anon/public key values
   - For more security, consider:
     - Setting up a domain name for your backend API
     - Configuring HTTPS for your API endpoint
     - Using AWS Secrets Manager for sensitive environment variables

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

## Troubleshooting npm Errors

If you encounter npm-related errors during deployment, try these steps:

1. **Package-lock.json issues:**
   - If you see errors about missing package-lock.json, modify your build settings to use `npm install` instead of `npm ci`
   - Alternatively, commit a package-lock.json file to your repository

2. **Directory navigation errors:**
   - Use the `--prefix` flag with npm commands instead of changing directories:
     ```
     npm --prefix frontend install
     npm --prefix frontend run build
     ```

3. **Node.js version issues:**
   - If you encounter compatibility issues, specify the Node.js version in the Amplify console
   - You can also add a .nvmrc file to your repository

## Troubleshooting Directory Structure Issues

If you encounter errors related to file paths or directory structure:

1. **Double-check your repository structure:**
   - Ensure your Next.js application is in the `frontend` directory at the root of your repository
   - Your repository structure should look like:
     ```
     /
     ├── frontend/
     │   ├── package.json
     │   ├── next.config.js
     │   └── ...other Next.js files
     ├── backend/
     │   └── ...backend files
     ├── amplify.yml
     └── README.md
     ```

2. **Check directory navigation in build commands:**
   - Make sure the commands in amplify.yml use the correct paths
   - Commands should navigate to the frontend directory before running npm commands
   - Artifacts paths should be relative to where commands are executed

3. **ENOENT errors:**
   - These typically indicate that a file or directory doesn't exist at the expected path
   - Verify that you're using the correct directory structure in your build commands
   - Try simplifying the build process by using `cd` commands and relative paths

4. **Artifact directory errors:**
   - Error message `Artifact directory doesn't exist` indicates that Amplify can't find your build output
   - Make sure the `baseDirectory` in amplify.yml points to the correct location relative to the repository root
   - For Next.js projects within a frontend directory, the correct path is typically `frontend/.next`
   - Remember that directory paths in the `artifacts` section are relative to the repository root, not to where the build commands run

## Troubleshooting Environment Variable Issues

If you encounter errors related to missing environment variables:

1. **Supabase authentication errors:**
   - Error messages containing `NEXT_PUBLIC_SUPABASE_URL and NEXT_PUBLIC_SUPABASE_ANON_KEY env variables are required` indicate missing Supabase credentials.
   - Add these variables in the AWS Amplify Console under "Environment variables":
     - `NEXT_PUBLIC_SUPABASE_URL`: Your Supabase project URL 
     - `NEXT_PUBLIC_SUPABASE_ANON_KEY`: Your Supabase project's anonymous API key

2. **Verifying environment variables:**
   - In the Amplify Console, go to "Build details" for your latest build
   - Check the logs to ensure environment variables are being correctly applied
   - Variables should appear (with values redacted) in the build logs

3. **Environment variable scope:**
   - Ensure variables are applied to all branches that need them
   - You can set branch-specific variables for different environments (dev/prod)

4. **Testing locally before deployment:**
   - Create a `.env.local` file in your frontend directory using the `.env.local.example` template
   - Fill in the actual values for your environment variables
   - Run `npm run dev` to test the application locally

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