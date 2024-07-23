
        import * as cdk from '@aws-cdk/core';
import * as glue from '@aws-cdk/aws-glue';
import * as iam from '@aws-cdk/aws-iam';
import * as s3 from '@aws-cdk/aws-s3';

export class GlueStack extends cdk.Stack {
  constructor(scope: cdk.Construct, id: string, props?: cdk.StackProps) {
    super(scope, id, props);

    const bucket = s3.Bucket.fromBucketName(this, 'MyGlueBucket', 'my-shiv881');

    // Glue Service Role
    const glueServiceRole = new iam.Role(this, 'GlueServiceRole', {
      assumedBy: new iam.ServicePrincipal('glue.amazonaws.com'),
      managedPolicies: [
        iam.ManagedPolicy.fromAwsManagedPolicyName('service-role/AWSGlueServiceRole'),
      ],
    });

    glueServiceRole.addToPolicy(new iam.PolicyStatement({
      resources: [
        bucket.bucketArn,
        `${bucket.bucketArn}/*`,
      ],
      actions: [
        's3:GetObject',
        's3:PutObject',
        's3:ListBucket',
      ],
    }));

    glueServiceRole.addToPolicy(new iam.PolicyStatement({
      resources: ['*'],
      actions: [
        'logs:CreateLogGroup',
        'logs:CreateLogStream',
        'logs:PutLogEvents',
        'glue:*',
      ],
    }));

    // Glue Database
    const glueDatabase = new glue.CfnDatabase(this, 'GlueDatabase', {
      catalogId: cdk.Aws.ACCOUNT_ID,
      databaseInput: {
        name: 'cbsgule',
      },
    });

    // Glue Crawler
    const glueCrawler = new glue.CfnCrawler(this, 'GlueCrawler', {
      role: glueServiceRole.roleArn,
      databaseName: glueDatabase.ref,
      targets: {
        s3Targets: [{ path: `s3://${bucket.bucketName}/data/` }],
      },
      schedule: {
        scheduleExpression: 'cron(0 12 * * ? *)',
      },
      schemaChangePolicy: {
        updateBehavior: 'UPDATE_IN_DATABASE',
        deleteBehavior: 'DEPRECATE_IN_DATABASE',
      },
      name: 'cba_crawler_name',
    });

    // Glue Job
    const glueJob = new glue.CfnJob(this, 'GlueJob', {
      name: 'cba_glue_job',
      role: glueServiceRole.roleArn,
      command: {
        name: 'glueetl',
        scriptLocation: `s3://${bucket.bucketName}/scripts/my_glue_script.py`,
        pythonVersion: '3',
      },
      defaultArguments: {
        '--TempDir': `s3://${bucket.bucketName}/temp/`,
        '--job-language': 'python',
      },
      glueVersion: '2.0',
      maxRetries: 0,
      timeout: 2880,
      numberOfWorkers: 10,
      workerType: 'G.1X',
    });

    // Glue Table
    const glueTable = new glue.CfnTable(this, 'GlueTable', {
      catalogId: cdk.Aws.ACCOUNT_ID,
      databaseName: glueDatabase.ref,
      tableInput: {
        name: 'my_table',
        tableType: 'EXTERNAL_TABLE',
        parameters: {
          classification: 'json',
        },
        storageDescriptor: {
          columns: [
            { name: 'column1', type: 'string' },
            { name: 'column2', type: 'int' },
          ],
          location: `s3://${bucket.bucketName}/data/`,
          inputFormat: 'org.apache.hadoop.mapred.TextInputFormat',
          outputFormat: 'org.apache.hadoop.hive.ql.io.HiveIgnoreKeyTextOutputFormat',
          serdeInfo: {
            serializationLibrary: 'org.openx.data.jsonserde.JsonSerDe',
          },
        },
      },
    });
  }
}
  
