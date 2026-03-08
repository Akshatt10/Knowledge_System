import boto3
from botocore.exceptions import ClientError
from botocore.config import Config
from app.config import settings
import logging

logger = logging.getLogger(__name__)

class S3Service:
    def __init__(self):
        client_kwargs = {
            'aws_access_key_id': settings.AWS_ACCESS_KEY_ID,
            'aws_secret_access_key': settings.AWS_SECRET_ACCESS_KEY,
            'region_name': settings.AWS_DEFAULT_REGION,
            'config': Config(s3={'addressing_style': 'path'})
        }
        
        # Only inject endpoint_url if it's explicitly set (e.g. for MinIO)
        # Boto3 natively figures out the AWS endpoint if this is None/omitted.
        if settings.S3_ENDPOINT_URL:
            client_kwargs['endpoint_url'] = settings.S3_ENDPOINT_URL

        self.s3_client = boto3.client('s3', **client_kwargs)
        self.bucket = settings.S3_BUCKET_NAME
        self._ensure_bucket_exists()

    def _ensure_bucket_exists(self):
        try:
            self.s3_client.head_bucket(Bucket=self.bucket)
        except ClientError as e:
            error_code = e.response.get('Error', {}).get('Code')
            if error_code == '404':
                logger.info(f"Bucket {self.bucket} not found. Creating...")
                # MinIO doesn't require LocationConstraint for us-east-1, but actual S3 does for other regions
                if settings.AWS_DEFAULT_REGION == 'us-east-1':
                    self.s3_client.create_bucket(Bucket=self.bucket)
                else:
                    self.s3_client.create_bucket(
                        Bucket=self.bucket,
                        CreateBucketConfiguration={'LocationConstraint': settings.AWS_DEFAULT_REGION}
                    )
            else:
                logger.error(f"Error checking bucket {self.bucket}: {e}")
                raise e

    def upload_file(self, file_path: str, object_name: str) -> str:
        """Upload a file to an S3 bucket and return the S3 URI."""
        try:
            self.s3_client.upload_file(file_path, self.bucket, object_name)
            s3_uri = f"s3://{self.bucket}/{object_name}"
            return s3_uri
        except ClientError as e:
            logger.error(f"Failed to upload {file_path} to S3: {e}")
            raise e

    def download_file(self, object_name: str, file_path: str):
        """Download a file from an S3 bucket."""
        try:
            self.s3_client.download_file(self.bucket, object_name, file_path)
            return True
        except ClientError as e:
            logger.error(f"Failed to download {object_name} from S3: {e}")
            raise e

    def delete_file(self, object_name: str):
        """Delete a file from an S3 bucket."""
        try:
            self.s3_client.delete_object(Bucket=self.bucket, Key=object_name)
            return True
        except ClientError as e:
            logger.error(f"Failed to delete {object_name} from S3: {e}")
            return False

s3_service = S3Service()
