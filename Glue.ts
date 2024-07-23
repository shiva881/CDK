import * as cdk from '@aws-cdk/core';
import * as codepipeline from '@aws-cdk/aws-codepipeline';
import * as codepipeline_actions from '@aws-cdk/aws-codepipeline-actions';
import * as codebuild from '@aws-cdk/aws-codebuild';
import * as iam from '@aws-cdk/aws-iam';

export class PipelineStack extends cdk.Stack {
  constructor(scope: cdk.Construct, id: string, props?: cdk.StackProps) {
    super(scope, id, props);

    const sourceOutput = new codepipeline.Artifact();
    const cdkBuildOutput = new codepipeline.Artifact();

    const pipeline = new codepipeline.Pipeline(this, 'Pipeline', {
      pipelineName: 'MyCdkPipeline',
      stages: [
        {
          stageName: 'Source',
          actions: [
            new codepipeline_actions.GitHubSourceAction({
              actionName: 'GitHub_Source',
              owner: 'your-github-username',
              repo: 'your-cdk-repo',
              branch: 'main',
              oauthToken: cdk.SecretValue.secretsManager('github-token'),
              output: sourceOutput,
            }),
          ],
        },
        {
          stageName: 'Build',
          actions: [
            new codepipeline_actions.CodeBuildAction({
              actionName: 'CDK_Build',
              project: new codebuild.PipelineProject(this, 'CdkBuildProject', {
                buildSpec: codebuild.BuildSpec.fromObject({
                  version: '0.2',
                  phases: {
                    install: {
                      commands: 'npm install',
                    },
                    build: {
                      commands: [
                        'npm run build',
                        'npx cdk synth',
                      ],
                    },
                  },
                  artifacts: {
                    'base-directory': 'cdk.out',
                    files: '**/*',
                  },
                }),
                environment: {
                  buildImage: codebuild.LinuxBuildImage.STANDARD_5_0,
                },
              }),
              input: sourceOutput,
              outputs: [cdkBuildOutput],
            }),
          ],
        },
        {
          stageName: 'Deploy',
          actions: [
            new codepipeline_actions.CloudFormationCreateUpdateStackAction({
              actionName: 'CFN_Deploy',
              templatePath: cdkBuildOutput.atPath('MyCdkStack.template.json'),
              stackName: 'MyCdkStack',
              adminPermissions: true,
            }),
          ],
        },
      ],
    });

    // Add necessary permissions for CodeBuild to deploy CDK
    const deployRole = pipeline.role?.node.tryFindChild('DefaultPolicy') as iam.Policy;
    deployRole?.addStatements(
      new iam.PolicyStatement({
        actions: ['sts:AssumeRole'],
        resources: ['*'],
      })
    );
  }
}
